import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Run all diagnostics endpoints in parallel
    const baseUrl = request.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

    const [pipelineRes, schedulersRes, e2eRes, pipelineFlowRes] = await Promise.all([
      fetch(`${protocol}://${baseUrl}/api/diagnostics/pipeline`),
      fetch(`${protocol}://${baseUrl}/api/diagnostics/schedulers`),
      fetch(`${protocol}://${baseUrl}/api/diagnostics/e2e`),
      fetch(`${protocol}://${baseUrl}/api/diagnostics/pipeline-flow`)
    ]);

    if (!pipelineRes.ok) {
      throw new Error('Failed to fetch pipeline diagnostics');
    }

    const pipelineData = await pipelineRes.json();
    const schedulersData = schedulersRes.ok ? await schedulersRes.json() : null;
    const e2eData = e2eRes.ok ? await e2eRes.json() : null;
    const pipelineFlowData = pipelineFlowRes.ok ? await pipelineFlowRes.json() : null;

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

    // Collect all issues from all sources
    const issues: string[] = [];

    // Pipeline issues
    sources.forEach((source: any) => {
      if (source.issues && source.issues.length > 0) {
        issues.push(`[SOURCE] ${source.name}: ${source.issues.join(', ')}`);
      }
    });
    masterTables.forEach((table: any) => {
      if (table.issues && table.issues.length > 0) {
        issues.push(`[MASTER] ${table.name}: ${table.issues.join(', ')}`);
      }
    });
    pipelineData.consistency.checks.forEach((check: any) => {
      if (!check.passed) {
        issues.push(`[CONSISTENCY] ${check.name}: ${check.message}`);
      }
    });

    // E2E test issues
    if (e2eData) {
      e2eData.checks.forEach((check: any) => {
        if (check.status === 'error') {
          issues.push(`[E2E-ERROR] ${check.name}: ${check.message}`);
        } else if (check.status === 'warning') {
          issues.push(`[E2E-WARN] ${check.name}: ${check.message}`);
        }
      });
    }

    // Pipeline flow issues
    if (pipelineFlowData) {
      pipelineFlowData.nodes.forEach((node: any) => {
        if (node.status === 'error' && node.metadata.issues && node.metadata.issues.length > 0) {
          issues.push(`[PIPELINE] ${node.name}: ${node.metadata.issues.join(', ')}`);
        }
      });

      const brokenEdges = pipelineFlowData.edges.filter((e: any) => e.status === 'broken');
      if (brokenEdges.length > 0) {
        issues.push(`[PIPELINE] ${brokenEdges.length} broken data flow connections detected`);
      }
    }

    const executionTime = Date.now() - startTime;

    // E2E metrics
    const e2eMetrics = e2eData ? {
      total_checks: e2eData.summary.totalChecks,
      passed: e2eData.summary.passed,
      warnings: e2eData.summary.warnings,
      errors: e2eData.summary.errors,
      avg_response_time_ms: e2eData.summary.avgResponseTime
    } : null;

    // Pipeline flow metrics
    const pipelineFlowMetrics = pipelineFlowData ? {
      total_nodes: pipelineFlowData.nodes.length,
      healthy_nodes: pipelineFlowData.nodes.filter((n: any) => n.status === 'healthy').length,
      warning_nodes: pipelineFlowData.nodes.filter((n: any) => n.status === 'warning').length,
      error_nodes: pipelineFlowData.nodes.filter((n: any) => n.status === 'error').length,
      total_edges: pipelineFlowData.edges.length,
      active_edges: pipelineFlowData.edges.filter((e: any) => e.status === 'active').length,
      stale_edges: pipelineFlowData.edges.filter((e: any) => e.status === 'stale').length,
      broken_edges: pipelineFlowData.edges.filter((e: any) => e.status === 'broken').length
    } : null;

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

      // E2E test results
      e2e_total_checks: e2eMetrics?.total_checks || 0,
      e2e_passed: e2eMetrics?.passed || 0,
      e2e_warnings: e2eMetrics?.warnings || 0,
      e2e_errors: e2eMetrics?.errors || 0,
      e2e_avg_response_time_ms: e2eMetrics?.avg_response_time_ms || 0,

      // Pipeline flow results
      pipeline_total_nodes: pipelineFlowMetrics?.total_nodes || 0,
      pipeline_healthy_nodes: pipelineFlowMetrics?.healthy_nodes || 0,
      pipeline_warning_nodes: pipelineFlowMetrics?.warning_nodes || 0,
      pipeline_error_nodes: pipelineFlowMetrics?.error_nodes || 0,
      pipeline_total_edges: pipelineFlowMetrics?.total_edges || 0,
      pipeline_active_edges: pipelineFlowMetrics?.active_edges || 0,
      pipeline_stale_edges: pipelineFlowMetrics?.stale_edges || 0,
      pipeline_broken_edges: pipelineFlowMetrics?.broken_edges || 0,

      // Full diagnostic details (JSON)
      diagnostic_details: JSON.stringify({
        pipeline: pipelineData,
        schedulers: schedulersData,
        e2e: e2eData,
        pipelineFlow: pipelineFlowData
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
