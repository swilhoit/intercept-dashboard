import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Fetch current pipeline state
    const baseUrl = request.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    const [pipelineRes, historyRes] = await Promise.all([
      fetch(`${protocol}://${baseUrl}/api/diagnostics/pipeline`),
      fetch(`${protocol}://${baseUrl}/api/diagnostics/history?days=30`)
    ]);

    if (!pipelineRes.ok || !historyRes.ok) {
      throw new Error('Failed to fetch diagnostic data');
    }

    const currentState = await pipelineRes.json();
    const history = await historyRes.json();

    // Prepare context for AI analysis
    const context = {
      current: {
        timestamp: currentState.timestamp,
        overall_status: currentState.overallStatus,
        data_sources: {
          total: Object.keys(currentState.sources).length,
          healthy: Object.values(currentState.sources).filter((s: any) => s.status === 'healthy').length,
          warning: Object.values(currentState.sources).filter((s: any) => s.status === 'warning').length,
          error: Object.values(currentState.sources).filter((s: any) => s.status === 'error').length,
          details: Object.entries(currentState.sources).map(([key, source]: [string, any]) => ({
            name: source.name,
            status: source.status,
            lastSync: source.lastSync,
            rowCount: source.rowCount,
            issues: source.issues,
            revenue7d: source.metrics?.last7DaysRevenue || 0
          }))
        },
        consistency_checks: {
          passed: currentState.consistency.checks.filter((c: any) => c.passed).length,
          failed: currentState.consistency.checks.filter((c: any) => !c.passed).length,
          details: currentState.consistency.checks.map((c: any) => ({
            name: c.name,
            passed: c.passed,
            message: c.message
          }))
        },
        total_7day_revenue: Object.values(currentState.sources)
          .filter((s: any) => s.metrics?.last7DaysRevenue)
          .reduce((sum: number, s: any) => sum + (s.metrics?.last7DaysRevenue || 0), 0)
      },
      history: {
        total_runs: history.summary.total_runs,
        healthy_runs: history.summary.healthy_runs,
        health_percentage: history.summary.health_percentage,
        avg_revenue: history.summary.avg_7day_revenue,
        recent_logs: history.logs.slice(0, 10).map((log: any) => ({
          timestamp: log.timestamp,
          status: log.overall_status,
          revenue: log.total_7day_revenue,
          healthy_sources: log.data_sources_healthy,
          issues: log.issues_detected
        })),
        issues_over_time: history.issues.slice(0, 5)
      }
    };

    // Create AI prompt for analysis
    const prompt = `You are an AI data pipeline analyst. Analyze the following sales data pipeline diagnostics and provide actionable insights.

CURRENT STATE:
- Overall Status: ${context.current.overall_status}
- Data Sources: ${context.current.data_sources.healthy}/${context.current.data_sources.total} healthy
- Consistency Checks: ${context.current.consistency_checks.passed} passed, ${context.current.consistency_checks.failed} failed
- Current 7-Day Revenue: $${context.current.total_7day_revenue.toFixed(2)}

RECENT ISSUES:
${context.current.data_sources.details
  .filter((s: any) => s.issues.length > 0)
  .map((s: any) => `- ${s.name}: ${s.issues.join(', ')}`)
  .join('\n') || 'None detected'}

${context.current.consistency_checks.details
  .filter((c: any) => !c.passed)
  .map((c: any) => `- ${c.name}: ${c.message}`)
  .join('\n') || ''}

HISTORICAL PERFORMANCE (Last 30 Days):
- Total Health Checks: ${context.history.total_runs}
- System Uptime: ${context.history.health_percentage.toFixed(1)}%
- Average 7-Day Revenue: $${context.history.avg_revenue.toFixed(2)}

REVENUE TREND:
${context.history.recent_logs.map((log: any) =>
  `${new Date(log.timestamp).toLocaleDateString()}: $${log.revenue?.toFixed(2) || 0} (${log.status})`
).join('\n')}

DATA SOURCE DETAILS:
${context.current.data_sources.details.map((s: any) =>
  `- ${s.name}: ${s.status} | ${s.rowCount.toLocaleString()} rows | Last sync: ${s.lastSync || 'N/A'} | Revenue: $${s.revenue7d.toFixed(2)}`
).join('\n')}

Provide:
1. **Executive Summary** (2-3 sentences about overall health)
2. **Key Insights** (3-5 bullet points about trends, patterns, or notable observations)
3. **Recommendations** (2-4 actionable items to improve the pipeline)
4. **Risk Assessment** (Any potential issues to watch)

Format your response in clear, concise markdown. Focus on business impact and actionable intelligence.`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data pipeline analyst specializing in e-commerce sales data. You provide clear, actionable insights about data quality, trends, and system health.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const insights = completion.choices[0].message.content;
    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      insights,
      metadata: {
        timestamp: new Date().toISOString(),
        execution_time_ms: executionTime,
        model: 'gpt-4o',
        context_analyzed: {
          current_sources: context.current.data_sources.total,
          historical_runs: context.history.total_runs,
          days_analyzed: 30
        }
      }
    });

  } catch (error: any) {
    console.error('Error generating AI insights:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
