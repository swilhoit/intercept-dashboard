import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

interface PipelineNode {
  id: string;
  name: string;
  type: 'source' | 'scheduler' | 'raw_table' | 'master_table' | 'api' | 'dashboard';
  status: 'healthy' | 'warning' | 'error' | 'idle';
  metadata: {
    lastUpdate?: string;
    recordCount?: number;
    dataFreshness?: string; // "2 hours ago"
    nextRun?: string;
    issues?: string[];
    metrics?: Record<string, any>;
  };
  dependencies: string[]; // IDs of nodes this depends on
}

interface PipelineFlow {
  timestamp: string;
  nodes: PipelineNode[];
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    status: 'active' | 'stale' | 'broken';
  }>;
  stages: {
    sources: PipelineNode[];
    schedulers: PipelineNode[];
    rawTables: PipelineNode[];
    masterTables: PipelineNode[];
    apis: PipelineNode[];
    dashboards: PipelineNode[];
  };
}

const PROJECT_ID = 'intercept-sales-2508061117';

export async function GET(request: NextRequest) {
  try {
    const nodes: PipelineNode[] = [];
    const edges: Array<{ from: string; to: string; label?: string; status: 'active' | 'stale' | 'broken' }> = [];

    // ===== STAGE 1: Data Sources =====
    const sources = [
      { id: 'amazon-seller-api', name: 'Amazon Seller API', table: 'amazon_seller.amazon_orders_2025' },
      { id: 'amazon-ads-api', name: 'Amazon Ads API', table: 'amazon_ads_sharepoint.keywords_enhanced' },
      { id: 'shopify-api', name: 'Shopify API', table: 'shopify.waterwise_daily_product_sales_clean' },
      { id: 'woo-brickanew', name: 'WooCommerce BrickAnew', table: 'woocommerce.brickanew_daily_product_sales' },
      { id: 'woo-heatilator', name: 'WooCommerce Heatilator', table: 'woocommerce.heatilator_daily_product_sales' },
      { id: 'woo-superior', name: 'WooCommerce Superior', table: 'woocommerce.superior_daily_product_sales' },
      { id: 'ga4-brickanew', name: 'GA4 Brick Anew', table: 'brick_anew_ga4.attribution_channel_performance' },
      { id: 'ga4-heatilator', name: 'GA4 Heatilator', table: 'heatilator_ga4.attribution_channel_performance' }
    ];

    // ===== STAGE 2: Schedulers =====
    const schedulers = [
      { id: 'amazon-daily-sync', name: 'Amazon Daily Sync', target: 'amazon-seller-api' },
      { id: 'amazon-ads-daily', name: 'Amazon Ads Daily', target: 'amazon-ads-api' },
      { id: 'shopify-daily-sync', name: 'Shopify Daily Sync', target: 'shopify-api' },
      { id: 'woocommerce-fetch-daily', name: 'WooCommerce Fetch', targets: ['woo-brickanew', 'woo-heatilator', 'woo-superior'] },
      { id: 'ga4-attribution-daily', name: 'GA4 Attribution Sync', targets: ['ga4-brickanew', 'ga4-heatilator'] }
    ];

    // Query scheduler status
    const schedulerStatusQuery = `
      SELECT name, state, schedule, last_run_time, next_run_time
      FROM \`${PROJECT_ID}.INFORMATION_SCHEMA.JOBS\`
      WHERE project_id = '${PROJECT_ID}'
    `;

    // Create source nodes and check their health
    for (const source of sources) {
      const [tableName, datasetAndTable] = source.table.includes('.')
        ? source.table.split('.')
        : ['', source.table];

      const checkQuery = `
        SELECT
          COUNT(*) as count,
          MAX(date) as last_date
        FROM \`${PROJECT_ID}.${source.table}\`
      `;

      try {
        const [rows] = await bigquery.query(checkQuery);
        const row = rows[0];
        const lastDate = row.last_date?.value || row.last_date;
        const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

        nodes.push({
          id: source.id,
          name: source.name,
          type: 'source',
          status: daysSince > 7 ? 'warning' : daysSince > 2 ? 'warning' : 'healthy',
          metadata: {
            lastUpdate: lastDate,
            recordCount: parseInt(row.count),
            dataFreshness: daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`,
            issues: daysSince > 2 ? [`Data is ${daysSince} days old`] : []
          },
          dependencies: []
        });
      } catch (error) {
        nodes.push({
          id: source.id,
          name: source.name,
          type: 'source',
          status: 'error',
          metadata: {
            issues: [`Failed to query: ${error}`]
          },
          dependencies: []
        });
      }
    }

    // ===== STAGE 3: Master Tables =====
    const masterTables = [
      {
        id: 'master-daily-sales',
        name: 'MASTER.TOTAL_DAILY_SALES',
        table: 'MASTER.TOTAL_DAILY_SALES',
        dependencies: ['amazon-seller-api', 'shopify-api', 'woo-brickanew', 'woo-heatilator', 'woo-superior']
      },
      {
        id: 'master-daily-ads',
        name: 'MASTER.TOTAL_DAILY_ADS',
        table: 'MASTER.TOTAL_DAILY_ADS',
        dependencies: ['amazon-ads-api']
      }
    ];

    for (const master of masterTables) {
      const checkQuery = `
        SELECT
          COUNT(*) as count,
          MAX(date) as last_date,
          SUM(CASE WHEN date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recent_records
        FROM \`${PROJECT_ID}.${master.table}\`
      `;

      try {
        const [rows] = await bigquery.query(checkQuery);
        const row = rows[0];
        const lastDate = row.last_date?.value || row.last_date;
        const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

        nodes.push({
          id: master.id,
          name: master.name,
          type: 'master_table',
          status: daysSince > 2 ? 'warning' : 'healthy',
          metadata: {
            lastUpdate: lastDate,
            recordCount: parseInt(row.count),
            dataFreshness: daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`,
            metrics: {
              recentRecords: parseInt(row.recent_records || 0)
            }
          },
          dependencies: master.dependencies
        });

        // Create edges from sources to master tables
        master.dependencies.forEach(depId => {
          edges.push({
            from: depId,
            to: master.id,
            label: 'aggregates',
            status: daysSince <= 1 ? 'active' : daysSince <= 7 ? 'stale' : 'broken'
          });
        });
      } catch (error) {
        nodes.push({
          id: master.id,
          name: master.name,
          type: 'master_table',
          status: 'error',
          metadata: {
            issues: [`Query failed: ${error}`]
          },
          dependencies: master.dependencies
        });
      }
    }

    // ===== STAGE 4: APIs =====
    const apis = [
      {
        id: 'api-sales-summary',
        name: 'Sales Summary API',
        endpoint: '/api/sales/summary',
        dependencies: ['master-daily-sales']
      },
      {
        id: 'api-sales-daily',
        name: 'Daily Sales API',
        endpoint: '/api/sales/daily',
        dependencies: ['master-daily-sales']
      },
      {
        id: 'api-ads-campaigns',
        name: 'Ads Campaigns API',
        endpoint: '/api/ads/campaigns',
        dependencies: ['amazon-ads-api']
      },
      {
        id: 'api-ads-metrics',
        name: 'Ads Metrics API',
        endpoint: '/api/ads/master-metrics',
        dependencies: ['master-daily-ads']
      },
      {
        id: 'api-ga4-traffic',
        name: 'GA4 Traffic API',
        endpoint: '/api/analytics/traffic',
        dependencies: ['ga4-brickanew', 'ga4-heatilator']
      }
    ];

    for (const api of apis) {
      nodes.push({
        id: api.id,
        name: api.name,
        type: 'api',
        status: 'idle', // Will be tested by E2E
        metadata: {
          metrics: {
            endpoint: api.endpoint
          }
        },
        dependencies: api.dependencies
      });

      // Create edges from dependencies to APIs
      api.dependencies.forEach(depId => {
        edges.push({
          from: depId,
          to: api.id,
          label: 'serves',
          status: 'active'
        });
      });
    }

    // ===== STAGE 5: Dashboard Components =====
    const dashboards = [
      { id: 'dashboard-sales', name: 'Sales Dashboard', dependencies: ['api-sales-summary', 'api-sales-daily'] },
      { id: 'dashboard-ads', name: 'Advertising Dashboard', dependencies: ['api-ads-campaigns', 'api-ads-metrics'] },
      { id: 'dashboard-analytics', name: 'Analytics Dashboard', dependencies: ['api-ga4-traffic'] }
    ];

    for (const dashboard of dashboards) {
      nodes.push({
        id: dashboard.id,
        name: dashboard.name,
        type: 'dashboard',
        status: 'idle',
        metadata: {},
        dependencies: dashboard.dependencies
      });

      // Create edges from APIs to dashboards
      dashboard.dependencies.forEach(depId => {
        edges.push({
          from: depId,
          to: dashboard.id,
          label: 'displays',
          status: 'active'
        });
      });
    }

    // Organize nodes by stage
    const stages = {
      sources: nodes.filter(n => n.type === 'source'),
      schedulers: nodes.filter(n => n.type === 'scheduler'),
      rawTables: nodes.filter(n => n.type === 'raw_table'),
      masterTables: nodes.filter(n => n.type === 'master_table'),
      apis: nodes.filter(n => n.type === 'api'),
      dashboards: nodes.filter(n => n.type === 'dashboard')
    };

    const result: PipelineFlow = {
      timestamp: new Date().toISOString(),
      nodes,
      edges,
      stages
    };

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
