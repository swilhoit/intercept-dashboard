import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

const PROJECT_ID = 'intercept-sales-2508061117';

interface DataSourceCheck {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  lastSync: string | null;
  rowCount: number;
  dateRange: { earliest: string | null; latest: string | null };
  issues: string[];
  metrics?: Record<string, any>;
}

interface PipelineCheck {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  sources: Record<string, DataSourceCheck>;
  masterTables: Record<string, DataSourceCheck>;
  consistency: {
    status: 'healthy' | 'warning' | 'error';
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;
      expected?: any;
      actual?: any;
    }>;
  };
  schedulers: Array<{
    name: string;
    status: string;
    schedule: string;
    lastRun?: string;
  }>;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const isAuthenticated = true; // Add proper auth check here

  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result: PipelineCheck = {
      timestamp: new Date().toISOString(),
      overallStatus: 'healthy',
      sources: {},
      masterTables: {},
      consistency: {
        status: 'healthy',
        checks: []
      },
      schedulers: []
    };

    // Check Amazon Sales Source
    result.sources.amazonSales = await checkTable(
      'amazon_seller.amazon_orders_2025',
      'Amazon Seller Orders',
      'Purchase_Date',
      3 // Should have data within last 3 days
    );

    result.sources.amazonSalesProcessed = await checkTable(
      'amazon.daily_total_sales',
      'Amazon Daily Sales (Processed)',
      'date',
      3
    );

    // Check WooCommerce Sources
    // Note: Superior and Majestic are low-volume sites, so use longer thresholds
    const wooSites = [
      { name: 'brickanew', threshold: 7 },
      { name: 'heatilator', threshold: 7 },
      { name: 'superior', threshold: 30 },  // Low-volume site
      { name: 'majestic', threshold: 30 }   // Low-volume site
    ];
    for (const site of wooSites) {
      result.sources[`woo_${site.name}`] = await checkTable(
        `woocommerce.${site.name}_daily_product_sales`,
        `WooCommerce ${site.name}`,
        'order_date',
        site.threshold
      );
    }

    // Check Shopify Source
    result.sources.shopify = await checkTable(
      'shopify.waterwise_daily_product_sales_clean',
      'Shopify WaterWise',
      'order_date',
      7
    );

    // Check Amazon Ads Sources
    result.sources.amazonAds = await checkTable(
      'MASTER.TOTAL_DAILY_ADS',
      'Amazon Ads (Master)',
      'date',
      2
    );

    // Check Master Tables
    result.masterTables.sales = await checkTable(
      'MASTER.TOTAL_DAILY_SALES',
      'Master Daily Sales',
      'date',
      2
    );

    result.masterTables.ads = await checkTable(
      'MASTER.TOTAL_DAILY_ADS',
      'Master Daily Ads',
      'date',
      2
    );

    // Data Consistency Checks
    await performConsistencyChecks(result);

    // Determine overall status
    const allChecks = [
      ...Object.values(result.sources),
      ...Object.values(result.masterTables)
    ];

    const errorCount = allChecks.filter(c => c.status === 'error').length;
    const warningCount = allChecks.filter(c => c.status === 'warning').length;

    if (errorCount > 0) {
      result.overallStatus = 'error';
    } else if (warningCount > 0) {
      result.overallStatus = 'warning';
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      overallStatus: 'error',
      error: error.message
    }, { status: 500 });
  }
}

async function checkTable(
  tableId: string,
  displayName: string,
  dateColumn: string,
  maxDaysSinceUpdate: number
): Promise<DataSourceCheck> {
  const check: DataSourceCheck = {
    name: displayName,
    status: 'healthy',
    lastSync: null,
    rowCount: 0,
    dateRange: { earliest: null, latest: null },
    issues: []
  };

  try {
    // For string date columns, cast to DATE
    const dateExpression = tableId.includes('amazon_seller.amazon_orders')
      ? `DATE(PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%S%Ez', ${dateColumn}))`
      : dateColumn;

    const query = `
      SELECT
        COUNT(*) as row_count,
        MIN(${dateExpression}) as earliest_date,
        MAX(${dateExpression}) as latest_date,
        DATE_DIFF(CURRENT_DATE(), MAX(${dateExpression}), DAY) as days_since_update
      FROM \`${PROJECT_ID}.${tableId}\`
    `;

    const [rows] = await bigquery.query(query);
    const row = rows[0];

    check.rowCount = parseInt(row.row_count);
    check.dateRange.earliest = row.earliest_date?.value || row.earliest_date;
    check.dateRange.latest = row.latest_date?.value || row.latest_date;
    check.lastSync = check.dateRange.latest;

    const daysSinceUpdate = parseInt(row.days_since_update);

    // Status determination
    if (check.rowCount === 0) {
      check.status = 'error';
      check.issues.push('No data found in table');
    } else if (daysSinceUpdate > maxDaysSinceUpdate) {
      check.status = 'warning';
      check.issues.push(`Last update was ${daysSinceUpdate} days ago (threshold: ${maxDaysSinceUpdate} days)`);
    }

    // Get additional metrics if this is a sales table
    if (tableId.includes('daily_product_sales') || tableId.includes('daily_total_sales')) {
      // Determine the correct revenue column name
      const revenueColumn = tableId.includes('amazon.daily_total_sales')
        ? 'ordered_product_sales'
        : 'total_revenue';

      const metricsQuery = `
        SELECT
          SUM(${revenueColumn}) as total_revenue,
          COUNT(DISTINCT ${dateColumn}) as days_with_data
        FROM \`${PROJECT_ID}.${tableId}\`
        WHERE ${dateColumn} >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      `;
      const [metricsRows] = await bigquery.query(metricsQuery);
      check.metrics = {
        last7DaysRevenue: parseFloat(metricsRows[0]?.total_revenue || 0),
        daysWithData: parseInt(metricsRows[0]?.days_with_data || 0)
      };
    }

  } catch (error: any) {
    check.status = 'error';
    check.issues.push(`Query failed: ${error.message}`);
  }

  return check;
}

async function performConsistencyChecks(result: PipelineCheck) {
  const checks = result.consistency.checks;

  try {
    // Check 1: MASTER sales should equal sum of sources
    const masterQuery = `
      SELECT
        SUM(amazon_sales) as amazon_total,
        SUM(woocommerce_sales) as woo_total,
        SUM(shopify_sales) as shopify_total,
        SUM(total_sales) as master_total
      FROM \`${PROJECT_ID}.MASTER.TOTAL_DAILY_SALES\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [masterRows] = await bigquery.query(masterQuery);
    const master = masterRows[0];

    const amazonSourceQuery = `
      SELECT SUM(ordered_product_sales) as total
      FROM \`${PROJECT_ID}.amazon.daily_total_sales\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [amazonRows] = await bigquery.query(amazonSourceQuery);
    const amazonSource = parseFloat(amazonRows[0]?.total || 0);

    const wooSourceQuery = `
      SELECT SUM(total_revenue) as total FROM (
        SELECT total_revenue FROM \`${PROJECT_ID}.woocommerce.brickanew_daily_product_sales\`
        WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        UNION ALL
        SELECT total_revenue FROM \`${PROJECT_ID}.woocommerce.heatilator_daily_product_sales\`
        WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        UNION ALL
        SELECT total_revenue FROM \`${PROJECT_ID}.woocommerce.superior_daily_product_sales\`
        WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      )
    `;
    const [wooRows] = await bigquery.query(wooSourceQuery);
    const wooSource = parseFloat(wooRows[0]?.total || 0);

    const shopifySourceQuery = `
      SELECT SUM(total_revenue) as total
      FROM \`${PROJECT_ID}.shopify.waterwise_daily_product_sales_clean\`
      WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [shopifyRows] = await bigquery.query(shopifySourceQuery);
    const shopifySource = parseFloat(shopifyRows[0]?.total || 0);

    const masterAmazon = parseFloat(master?.amazon_total || 0);
    const masterWoo = parseFloat(master?.woo_total || 0);
    const masterShopify = parseFloat(master?.shopify_total || 0);

    // Amazon consistency
    const amazonDiff = Math.abs(masterAmazon - amazonSource);
    checks.push({
      name: 'Amazon Sales Consistency',
      passed: amazonDiff < 0.01,
      message: amazonDiff < 0.01
        ? 'Amazon sales match between source and MASTER'
        : `Amazon sales mismatch: MASTER=$${masterAmazon.toFixed(2)}, Source=$${amazonSource.toFixed(2)}`,
      expected: amazonSource,
      actual: masterAmazon
    });

    // WooCommerce consistency
    const wooDiff = Math.abs(masterWoo - wooSource);
    checks.push({
      name: 'WooCommerce Sales Consistency',
      passed: wooDiff < 0.01,
      message: wooDiff < 0.01
        ? 'WooCommerce sales match between sources and MASTER'
        : `WooCommerce sales mismatch: MASTER=$${masterWoo.toFixed(2)}, Source=$${wooSource.toFixed(2)}`,
      expected: wooSource,
      actual: masterWoo
    });

    // Shopify consistency
    const shopifyDiff = Math.abs(masterShopify - shopifySource);
    checks.push({
      name: 'Shopify Sales Consistency',
      passed: shopifyDiff < 0.01,
      message: shopifyDiff < 0.01
        ? 'Shopify sales match between source and MASTER'
        : `Shopify sales mismatch: MASTER=$${masterShopify.toFixed(2)}, Source=$${shopifySource.toFixed(2)}`,
      expected: shopifySource,
      actual: masterShopify
    });

    // Check for duplicate detection
    const dupeCheckQuery = `
      SELECT
        order_date,
        product_id,
        sku,
        COUNT(*) as count
      FROM \`${PROJECT_ID}.woocommerce.brickanew_daily_product_sales\`
      WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      GROUP BY order_date, product_id, sku
      HAVING COUNT(*) > 1
    `;
    const [dupeRows] = await bigquery.query(dupeCheckQuery);
    checks.push({
      name: 'WooCommerce Duplicate Check',
      passed: dupeRows.length === 0,
      message: dupeRows.length === 0
        ? 'No duplicates found in WooCommerce data'
        : `Found ${dupeRows.length} duplicate records in WooCommerce`,
      expected: 0,
      actual: dupeRows.length
    });

    // Set consistency status
    const failedChecks = checks.filter(c => !c.passed).length;
    if (failedChecks > 0) {
      result.consistency.status = failedChecks > 2 ? 'error' : 'warning';
    }

  } catch (error: any) {
    checks.push({
      name: 'Consistency Check Failed',
      passed: false,
      message: `Error running consistency checks: ${error.message}`
    });
    result.consistency.status = 'error';
  }
}
