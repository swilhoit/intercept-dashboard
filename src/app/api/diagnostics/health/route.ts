import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

interface TableHealth {
  name: string;
  exists: boolean;
  rowCount: number | null;
  lastUpdate: string | null;
  status: 'healthy' | 'warning' | 'error';
  message?: string;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Define critical tables to check
    const criticalTables = [
      { dataset: 'MASTER', table: 'TOTAL_DAILY_SALES', description: 'Master sales data', dateColumn: 'date' },
      { dataset: 'MASTER', table: 'TOTAL_DAILY_ADS', description: 'Master ads data', dateColumn: 'date' },
      { dataset: 'amazon_ads_sharepoint', table: 'conversions_orders', description: 'Amazon conversions', dateColumn: 'date' },
      { dataset: 'googleads_brickanew', table: 'ads_CampaignBasicStats_4221545789', description: 'Google Ads stats', dateColumn: 'segments_date' },
      { dataset: 'woocommerce', table: 'brickanew_daily_product_sales', description: 'WooCommerce BrickAnew', dateColumn: 'order_date' },
      { dataset: 'woocommerce', table: 'heatilator_daily_product_sales', description: 'WooCommerce Heatilator', dateColumn: 'order_date' },
      { dataset: 'woocommerce', table: 'superior_daily_product_sales', description: 'WooCommerce Superior', dateColumn: 'order_date' },
      { dataset: 'shopify', table: 'waterwise_daily_product_sales_clean', description: 'Shopify WaterWise', dateColumn: 'order_date' },
    ];

    const tableHealthChecks: TableHealth[] = [];

    // Check each table
    for (const { dataset, table, description, dateColumn } of criticalTables) {
      try {
        // Check if table exists and get metadata
        const [metadata] = await bigquery
          .dataset(dataset)
          .table(table)
          .getMetadata();

        // Get row count and last modified date
        const query = `
          SELECT
            COUNT(*) as row_count,
            MAX(${dateColumn}) as last_date
          FROM \`${PROJECT_ID}.${dataset}.${table}\`
        `;

        const [rows] = await bigquery.query(query);
        const data = rows[0];

        const daysSinceUpdate = data.last_date
          ? Math.floor((Date.now() - new Date(data.last_date.value || data.last_date).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let status: 'healthy' | 'warning' | 'error' = 'healthy';
        let message = '';

        if (!data.row_count || data.row_count === 0) {
          status = 'error';
          message = 'No data in table';
        } else if (daysSinceUpdate === null) {
          status = 'warning';
          message = 'Cannot determine last update';
        } else if (daysSinceUpdate > 7) {
          status = 'error';
          message = `Data is ${daysSinceUpdate} days old`;
        } else if (daysSinceUpdate > 2) {
          status = 'warning';
          message = `Data is ${daysSinceUpdate} days old`;
        }

        tableHealthChecks.push({
          name: `${dataset}.${table}`,
          exists: true,
          rowCount: Number(data.row_count),
          lastUpdate: data.last_date?.value || data.last_date,
          status,
          message: message || description
        });

      } catch (error: any) {
        tableHealthChecks.push({
          name: `${dataset}.${table}`,
          exists: false,
          rowCount: null,
          lastUpdate: null,
          status: 'error',
          message: `Table not accessible: ${error.message}`
        });
      }
    }

    // Calculate overall health
    const healthyCount = tableHealthChecks.filter(t => t.status === 'healthy').length;
    const warningCount = tableHealthChecks.filter(t => t.status === 'warning').length;
    const errorCount = tableHealthChecks.filter(t => t.status === 'error').length;

    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    if (errorCount > 0) {
      overallStatus = 'error';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    }

    const executionTime = Date.now() - startTime;

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      executionTime: `${executionTime}ms`,
      summary: {
        total: tableHealthChecks.length,
        healthy: healthyCount,
        warning: warningCount,
        error: errorCount
      },
      tables: tableHealthChecks,
      bigquery: {
        connected: true,
        project: PROJECT_ID
      }
    });

  } catch (error: any) {
    console.error('Health check failed:', error);

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      executionTime: `${Date.now() - startTime}ms`,
      error: 'Health check failed',
      message: error.message,
      bigquery: {
        connected: false,
        project: PROJECT_ID
      }
    }, { status: 200 }); // Return 200 to avoid client errors
  }
}
