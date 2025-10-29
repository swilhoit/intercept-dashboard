import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Run diagnostics by calling the pipeline endpoint
    const baseUrl = request.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    const [pipelineRes, schedulersRes] = await Promise.all([
      fetch(`${protocol}://${baseUrl}/api/diagnostics/pipeline`),
      fetch(`${protocol}://${baseUrl}/api/diagnostics/schedulers`)
    ]);

    if (!pipelineRes.ok) {
      throw new Error('Failed to fetch pipeline diagnostics');
    }

    const pipelineData = await pipelineRes.json();
    const schedulersData = schedulersRes.ok ? await schedulersRes.json() : null;

    // Calculate summary metrics
    const sources = Object.values(pipelineData.sources);
    const masterTables = Object.values(pipelineData.masterTables);

    const dataSourcesHealthy = sources.filter((s: any) => s.status === 'healthy').length;
    const dataSourcesWarning = sources.filter((s: any) => s.status === 'warning').length;
    const dataSourcesError = sources.filter((s: any) => s.status === 'error').length;
    const masterTablesHealthy = masterTables.filter((t: any) => t.status === 'healthy').length;

    const consistencyChecksPassed = pipelineData.consistency.checks.filter((c: any) => c.passed).length;
    const consistencyChecksFailed = pipelineData.consistency.checks.filter((c: any) => !c.passed).length;

    // Calculate revenue totals
    let amazonRevenue = 0;
    let woocommerceRevenue = 0;
    let shopifyRevenue = 0;

    sources.forEach((source: any) => {
      if (source.metrics?.last7DaysRevenue) {
        if (source.name.includes('Amazon')) {
          amazonRevenue += source.metrics.last7DaysRevenue;
        } else if (source.name.includes('WooCommerce')) {
          woocommerceRevenue += source.metrics.last7DaysRevenue;
        } else if (source.name.includes('Shopify')) {
          shopifyRevenue += source.metrics.last7DaysRevenue;
        }
      }
    });

    const totalRevenue = amazonRevenue + woocommerceRevenue + shopifyRevenue;

    // Collect all issues
    const issues: string[] = [];
    sources.forEach((source: any) => {
      if (source.issues && source.issues.length > 0) {
        issues.push(`${source.name}: ${source.issues.join(', ')}`);
      }
    });
    masterTables.forEach((table: any) => {
      if (table.issues && table.issues.length > 0) {
        issues.push(`${table.name}: ${table.issues.join(', ')}`);
      }
    });
    pipelineData.consistency.checks.forEach((check: any) => {
      if (!check.passed) {
        issues.push(`${check.name}: ${check.message}`);
      }
    });

    const executionTime = Date.now() - startTime;

    // Prepare the log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      overall_status: pipelineData.overallStatus,
      data_sources_healthy: dataSourcesHealthy,
      data_sources_warning: dataSourcesWarning,
      data_sources_error: dataSourcesError,
      master_tables_healthy: masterTablesHealthy,
      consistency_checks_passed: consistencyChecksPassed,
      consistency_checks_failed: consistencyChecksFailed,
      schedulers_active: schedulersData?.summary?.active || 0,
      schedulers_total: schedulersData?.summary?.total || 0,
      total_7day_revenue: totalRevenue,
      amazon_7day_revenue: amazonRevenue,
      woocommerce_7day_revenue: woocommerceRevenue,
      shopify_7day_revenue: shopifyRevenue,
      issues_detected: issues.join(' | '),
      diagnostic_details: JSON.stringify({
        pipeline: pipelineData,
        schedulers: schedulersData
      }),
      execution_time_ms: executionTime
    };

    // Insert into BigQuery
    const tableId = `${PROJECT_ID}.MASTER.diagnostic_logs`;
    const table = bigquery.dataset('MASTER').table('diagnostic_logs');

    await table.insert([logEntry]);

    console.log('Diagnostic log saved to BigQuery:', {
      timestamp: logEntry.timestamp,
      overall_status: logEntry.overall_status,
      execution_time_ms: executionTime
    });

    return NextResponse.json({
      success: true,
      message: 'Diagnostic log saved successfully',
      summary: {
        timestamp: logEntry.timestamp,
        overall_status: logEntry.overall_status,
        data_sources_healthy: dataSourcesHealthy,
        data_sources_total: sources.length,
        consistency_checks_passed: consistencyChecksPassed,
        total_7day_revenue: totalRevenue,
        issues_count: issues.length,
        execution_time_ms: executionTime
      }
    });

  } catch (error: any) {
    console.error('Error logging diagnostics:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
