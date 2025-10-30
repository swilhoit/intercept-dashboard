import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    const limit = parseInt(searchParams.get('limit') || '100');

    // Get historical diagnostic logs
    const query = `
      SELECT
        timestamp,
        overall_status,
        data_sources_healthy,
        data_sources_warning,
        data_sources_error,
        master_tables_healthy,
        consistency_checks_passed,
        consistency_checks_failed,
        schedulers_active,
        schedulers_total,
        total_7day_revenue,
        amazon_7day_revenue,
        woocommerce_7day_revenue,
        shopify_7day_revenue,
        issues_detected,
        e2e_total_checks,
        e2e_passed,
        e2e_warnings,
        e2e_errors,
        e2e_avg_response_time_ms,
        pipeline_total_nodes,
        pipeline_healthy_nodes,
        pipeline_warning_nodes,
        pipeline_error_nodes,
        pipeline_total_edges,
        pipeline_active_edges,
        pipeline_stale_edges,
        pipeline_broken_edges,
        diagnostic_details,
        execution_time_ms
      FROM \`${PROJECT_ID}.MASTER.diagnostic_logs\`
      WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    const [rows] = await bigquery.query(query);

    // Calculate summary statistics
    const totalRuns = rows.length;
    const healthyRuns = rows.filter(r => r.overall_status === 'healthy').length;
    const warningRuns = rows.filter(r => r.overall_status === 'warning').length;
    const errorRuns = rows.filter(r => r.overall_status === 'error').length;

    const avgRevenue = rows.reduce((sum, r) => sum + (r.total_7day_revenue || 0), 0) / totalRuns;
    const avgExecutionTime = rows.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0) / totalRuns;

    // Get issues that occurred
    const allIssues = rows
      .filter(r => r.issues_detected)
      .map(r => ({
        timestamp: r.timestamp.value || r.timestamp,
        issues: r.issues_detected
      }));

    // Format timestamps and parse diagnostic details
    const logs = rows.map(row => ({
      timestamp: row.timestamp.value || row.timestamp,
      overall_status: row.overall_status,
      data_sources_healthy: row.data_sources_healthy,
      data_sources_warning: row.data_sources_warning,
      data_sources_error: row.data_sources_error,
      master_tables_healthy: row.master_tables_healthy,
      consistency_checks_passed: row.consistency_checks_passed,
      consistency_checks_failed: row.consistency_checks_failed,
      schedulers_active: row.schedulers_active,
      schedulers_total: row.schedulers_total,
      total_7day_revenue: row.total_7day_revenue,
      amazon_7day_revenue: row.amazon_7day_revenue,
      woocommerce_7day_revenue: row.woocommerce_7day_revenue,
      shopify_7day_revenue: row.shopify_7day_revenue,
      issues_detected: row.issues_detected,

      // E2E test results
      e2e_total_checks: row.e2e_total_checks || 0,
      e2e_passed: row.e2e_passed || 0,
      e2e_warnings: row.e2e_warnings || 0,
      e2e_errors: row.e2e_errors || 0,
      e2e_avg_response_time_ms: row.e2e_avg_response_time_ms || 0,

      // Pipeline flow results
      pipeline_total_nodes: row.pipeline_total_nodes || 0,
      pipeline_healthy_nodes: row.pipeline_healthy_nodes || 0,
      pipeline_warning_nodes: row.pipeline_warning_nodes || 0,
      pipeline_error_nodes: row.pipeline_error_nodes || 0,
      pipeline_total_edges: row.pipeline_total_edges || 0,
      pipeline_active_edges: row.pipeline_active_edges || 0,
      pipeline_stale_edges: row.pipeline_stale_edges || 0,
      pipeline_broken_edges: row.pipeline_broken_edges || 0,

      // Detailed diagnostic data (parsed JSON)
      diagnostic_details: row.diagnostic_details ? JSON.parse(row.diagnostic_details) : null,

      execution_time_ms: row.execution_time_ms
    }));

    return NextResponse.json({
      logs,
      summary: {
        total_runs: totalRuns,
        healthy_runs: healthyRuns,
        warning_runs: warningRuns,
        error_runs: errorRuns,
        health_percentage: totalRuns > 0 ? (healthyRuns / totalRuns) * 100 : 0,
        avg_7day_revenue: avgRevenue,
        avg_execution_time_ms: avgExecutionTime,
        days_analyzed: days
      },
      issues: allIssues
    });

  } catch (error: any) {
    console.error('Error fetching diagnostic history:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
