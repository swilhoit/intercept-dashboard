import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

interface DataPipeline {
  name: string;
  dataset: string;
  table: string;
  expectedUpdateFrequency: 'daily' | 'hourly';
  lastUpdate: string | null;
  rowCount: number;
  status: 'active' | 'stale' | 'error';
  daysSinceUpdate: number | null;
  message: string;
}

export async function GET(request: NextRequest) {
  try {
    // Instead of checking schedulers, check data pipeline health
    // This tells us if data is actually flowing regardless of how it's scheduled
    const pipelines: DataPipeline[] = [];

    const dataSources = [
      { name: 'Master Sales Data', dataset: 'MASTER', table: 'TOTAL_DAILY_SALES', frequency: 'daily' as const, dateColumn: 'date' },
      { name: 'Master Ads Data', dataset: 'MASTER', table: 'TOTAL_DAILY_ADS', frequency: 'daily' as const, dateColumn: 'date' },
      { name: 'Amazon Conversions', dataset: 'amazon_ads_sharepoint', table: 'conversions_orders', frequency: 'daily' as const, dateColumn: 'date' },
      { name: 'Amazon ROAS Summary', dataset: 'MASTER', table: 'AMAZON_ROAS_SUMMARY', frequency: 'daily' as const, dateColumn: 'calculation_date' },
      { name: 'BrickAnew WooCommerce', dataset: 'woocommerce', table: 'brickanew_daily_product_sales', frequency: 'daily' as const, dateColumn: 'order_date' },
      { name: 'Heatilator WooCommerce', dataset: 'woocommerce', table: 'heatilator_daily_product_sales', frequency: 'daily' as const, dateColumn: 'order_date' },
      { name: 'Superior WooCommerce', dataset: 'woocommerce', table: 'superior_daily_product_sales', frequency: 'daily' as const, dateColumn: 'order_date' },
    ];

    for (const source of dataSources) {
      try {
        const query = `
          SELECT
            COUNT(*) as row_count,
            MAX(${source.dateColumn}) as last_update
          FROM \`${PROJECT_ID}.${source.dataset}.${source.table}\`
        `;

        const [rows] = await bigquery.query(query);
        const data = rows[0];

        const lastUpdate = data.last_update?.value || data.last_update;
        const rowCount = Number(data.row_count) || 0;

        let daysSinceUpdate: number | null = null;
        let status: 'active' | 'stale' | 'error' = 'active';
        let message = 'Data is up to date';

        if (lastUpdate) {
          const lastUpdateDate = new Date(lastUpdate);
          const now = new Date();
          daysSinceUpdate = Math.floor((now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceUpdate === 0) {
            message = 'Updated today';
          } else if (daysSinceUpdate === 1) {
            message = 'Updated yesterday';
            status = 'stale';
          } else if (daysSinceUpdate > 7) {
            message = `${daysSinceUpdate} days since last update`;
            status = 'error';
          } else {
            message = `${daysSinceUpdate} days since last update`;
            status = 'stale';
          }
        } else {
          status = 'error';
          message = 'No data found';
        }

        pipelines.push({
          name: source.name,
          dataset: source.dataset,
          table: source.table,
          expectedUpdateFrequency: source.frequency,
          lastUpdate,
          rowCount,
          status,
          daysSinceUpdate,
          message
        });

      } catch (error: any) {
        pipelines.push({
          name: source.name,
          dataset: source.dataset,
          table: source.table,
          expectedUpdateFrequency: source.frequency,
          lastUpdate: null,
          rowCount: 0,
          status: 'error',
          daysSinceUpdate: null,
          message: `Error: ${error.message}`
        });
      }
    }

    const summary = {
      total: pipelines.length,
      active: pipelines.filter(p => p.status === 'active').length,
      stale: pipelines.filter(p => p.status === 'stale').length,
      error: pipelines.filter(p => p.status === 'error').length
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      pipelines,
      summary,
      note: 'Showing data freshness for key tables. Active = updated within 24h, Stale = 1-7 days, Error = >7 days or no data.'
    });

  } catch (error: any) {
    console.error('Error checking data pipelines:', error);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      pipelines: [],
      summary: {
        total: 0,
        active: 0,
        stale: 0,
        error: 0
      },
      error: 'Failed to check data pipelines',
      message: error.message
    }, { status: 200 });
  }
}
