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
    result.sources.amazonAdsConversions = await checkTable(
      'amazon_ads_sharepoint.conversions_orders',
      'Amazon Ads - Conversions & Orders',
      'date',
      3
    );

    result.sources.amazonAdsDailyKeywords = await checkTable(
      'amazon_ads_sharepoint.daily_keywords',
      'Amazon Ads - Daily Keywords',
      'date',
      3
    );

    // ⭐ NEW: Check keywords_enhanced (derived table)
    result.sources.amazonAdsKeywordsEnhanced = await checkTable(
      'amazon_ads_sharepoint.keywords_enhanced',
      'Amazon Ads - Keywords Enhanced (Derived)',
      'date',
      2  // Should be current since it's derived from source tables
    );

    // Check GA4 Attribution Sources
    result.sources.ga4BrickAnew = await checkTable(
      'brick_anew_ga4.attribution_channel_performance',
      'GA4 Attribution - Brick Anew',
      'date',
      2
    );

    result.sources.ga4Heatilator = await checkTable(
      'heatilator_ga4.attribution_channel_performance',
      'GA4 Attribution - Heatilator',
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

    // Check for date gaps in last 30 days - more thorough
    const gapCheckQuery = `
      WITH date_series AS (
        SELECT date
        FROM UNNEST(GENERATE_DATE_ARRAY(
          DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY),
          CURRENT_DATE()
        )) as date
      ),
      actual_dates AS (
        SELECT DISTINCT ${dateExpression} as date
        FROM \`${PROJECT_ID}.${tableId}\`
        WHERE ${dateExpression} >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          AND ${dateExpression} <= CURRENT_DATE()
      ),
      missing_dates AS (
        SELECT ds.date as missing_date
        FROM date_series ds
        LEFT JOIN actual_dates ad ON ds.date = ad.date
        WHERE ad.date IS NULL
        ORDER BY ds.date
      ),
      recent_missing AS (
        SELECT missing_date
        FROM missing_dates
        WHERE missing_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      )
      SELECT
        (SELECT COUNT(*) FROM missing_dates) as total_missing,
        (SELECT COUNT(*) FROM recent_missing) as recent_missing,
        (SELECT STRING_AGG(CAST(missing_date AS STRING), ', ') FROM missing_dates LIMIT 10) as all_missing_dates,
        (SELECT STRING_AGG(CAST(missing_date AS STRING), ', ') FROM recent_missing) as recent_missing_dates
    `;
    const [gapRows] = await bigquery.query(gapCheckQuery);
    const totalMissing = parseInt(gapRows[0]?.total_missing || 0);
    const recentMissing = parseInt(gapRows[0]?.recent_missing || 0);

    if (totalMissing > 0) {
      const allMissing = gapRows[0]?.all_missing_dates || '';
      const recentMissingStr = gapRows[0]?.recent_missing_dates || '';

      if (recentMissing > 0) {
        // Recent gaps are more concerning
        check.issues.push(`⚠️ ${recentMissing} missing dates in last 7 days: ${recentMissingStr}`);
        check.status = 'warning';
      }

      if (totalMissing > recentMissing) {
        check.issues.push(`${totalMissing - recentMissing} additional missing dates in last 30 days: ${allMissing}`);
      }

      // Severe warning if more than 30% of dates are missing
      const missingPercent = (totalMissing / 30) * 100;
      if (missingPercent > 30) {
        check.issues.push(`⚠️ Critical: ${missingPercent.toFixed(0)}% of dates missing in last 30 days`);
        if (check.status === 'healthy') check.status = 'warning';
      }
    }

    // Store gap metrics for detailed reporting
    if (totalMissing > 0) {
      check.metrics = check.metrics || {};
      check.metrics.dateGaps = {
        totalMissing,
        recentMissing,
        allMissingDates: gapRows[0]?.all_missing_dates,
        recentMissingDates: gapRows[0]?.recent_missing_dates
      };
    }

    // Get additional metrics based on table type
    if (tableId.includes('daily_product_sales') || tableId.includes('daily_total_sales')) {
      // Sales table metrics
      const revenueColumn = tableId.includes('amazon.daily_total_sales')
        ? 'ordered_product_sales'
        : 'total_revenue';

      const metricsQuery = `
        SELECT
          SUM(${revenueColumn}) as total_revenue,
          COUNT(DISTINCT ${dateColumn}) as days_with_data,
          AVG(${revenueColumn}) as avg_daily_revenue
        FROM \`${PROJECT_ID}.${tableId}\`
        WHERE ${dateColumn} >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      `;
      const [metricsRows] = await bigquery.query(metricsQuery);
      check.metrics = {
        last7DaysRevenue: parseFloat(metricsRows[0]?.total_revenue || 0),
        avgDailyRevenue: parseFloat(metricsRows[0]?.avg_daily_revenue || 0),
        daysWithData: parseInt(metricsRows[0]?.days_with_data || 0)
      };
    } else if (tableId.includes('TOTAL_DAILY_ADS') || tableId.includes('amazon_ads')) {
      // Amazon Ads metrics
      // conversions_orders and daily_keywords use 'cost', 'impressions', 'clicks'
      // MASTER table uses 'amazon_ads_spend', 'total_impressions', 'total_clicks'
      const spendCol = tableId.includes('MASTER') ? 'amazon_ads_spend' : 'cost';
      const impressionsCol = tableId.includes('MASTER') ? 'total_impressions' : 'impressions';
      const clicksCol = tableId.includes('MASTER') ? 'total_clicks' : 'clicks';
      const metricsQuery = `
        SELECT
          SUM(${spendCol}) as total_spend,
          SUM(${impressionsCol}) as total_impressions,
          SUM(${clicksCol}) as total_clicks,
          COUNT(DISTINCT ${dateColumn === 'date' ? dateColumn : dateExpression}) as days_with_data
        FROM \`${PROJECT_ID}.${tableId}\`
        WHERE ${dateColumn === 'date' ? dateColumn : dateExpression} >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      `;
      const [metricsRows] = await bigquery.query(metricsQuery);
      check.metrics = {
        last7DaysSpend: parseFloat(metricsRows[0]?.total_spend || 0),
        totalImpressions: parseInt(metricsRows[0]?.total_impressions || 0),
        totalClicks: parseInt(metricsRows[0]?.total_clicks || 0),
        daysWithData: parseInt(metricsRows[0]?.days_with_data || 0)
      };
    } else if (tableId.includes('attribution_channel_performance')) {
      // GA4 Attribution metrics
      const metricsQuery = `
        SELECT
          SUM(sessions) as total_sessions,
          SUM(totalUsers) as total_users,
          SUM(ecommercePurchases) as total_conversions,
          SUM(purchaseRevenue) as total_revenue,
          COUNT(DISTINCT ${dateColumn}) as days_with_data
        FROM \`${PROJECT_ID}.${tableId}\`
        WHERE ${dateColumn} >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      `;
      const [metricsRows] = await bigquery.query(metricsQuery);
      check.metrics = {
        last7DaysSessions: parseInt(metricsRows[0]?.total_sessions || 0),
        totalUsers: parseInt(metricsRows[0]?.total_users || 0),
        totalConversions: parseInt(metricsRows[0]?.total_conversions || 0),
        totalRevenue: parseFloat(metricsRows[0]?.total_revenue || 0),
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

    // Marketing Data Consistency Checks
    // ⭐ UPDATED: Check Amazon Ads spend consistency (use only conversions_orders)
    const masterAdsQuery = `
      SELECT
        SUM(total_spend) as total_spend,
        SUM(total_impressions) as total_impressions,
        SUM(total_clicks) as total_clicks
      FROM \`${PROJECT_ID}.MASTER.TOTAL_DAILY_ADS\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [masterAdsRows] = await bigquery.query(masterAdsQuery);
    const masterSpend = parseFloat(masterAdsRows[0]?.total_spend || 0);

    // ⭐ UPDATED: Use ONLY conversions_orders as authoritative source (no UNION)
    const sourceAdsQuery = `
      SELECT
        SUM(cost) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks
      FROM \`${PROJECT_ID}.amazon_ads_sharepoint.conversions_orders\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [sourceAdsRows] = await bigquery.query(sourceAdsQuery);
    const sourceSpend = parseFloat(sourceAdsRows[0]?.total_spend || 0);

    const spendDiff = Math.abs(masterSpend - sourceSpend);
    const spendDiffPct = masterSpend > 0 ? (spendDiff / masterSpend) * 100 : 0;

    checks.push({
      name: 'Amazon Ads Spend Consistency',
      passed: spendDiffPct < 5, // Allow 5% variance
      message: spendDiffPct < 5
        ? 'Amazon Ads spend matches between source and MASTER'
        : `⚠️ Amazon Ads spend variance: ${spendDiffPct.toFixed(1)}% (MASTER=$${masterSpend.toFixed(2)}, Source=$${sourceSpend.toFixed(2)})`,
      expected: sourceSpend,
      actual: masterSpend
    });

    // ⭐ NEW: Check for double-counting (anomaly detection)
    if (spendDiffPct > 50) {
      checks.push({
        name: 'Amazon Ads Double-Counting Detection',
        passed: false,
        message: `🚨 CRITICAL: Possible double-counting detected! MASTER is ${(masterSpend/sourceSpend).toFixed(1)}x the source data`,
        expected: 'Ratio ~1.0x',
        actual: `${(masterSpend/sourceSpend).toFixed(1)}x`
      });
    }

    // ⭐ NEW: Check keywords_enhanced staleness vs source tables
    const keywordsStaleQuery = `
      WITH source_max AS (
          SELECT MAX(date) as max_date
          FROM (
              SELECT MAX(date) as date FROM \`${PROJECT_ID}.amazon_ads_sharepoint.conversions_orders\`
              UNION ALL
              SELECT MAX(date) as date FROM \`${PROJECT_ID}.amazon_ads_sharepoint.keywords\`
              UNION ALL
              SELECT MAX(date) as date FROM \`${PROJECT_ID}.amazon_ads_sharepoint.daily_keywords\`
          )
      ),
      enhanced_max AS (
          SELECT MAX(date) as max_date
          FROM \`${PROJECT_ID}.amazon_ads_sharepoint.keywords_enhanced\`
      )
      SELECT
          s.max_date as source_max,
          e.max_date as enhanced_max,
          DATE_DIFF(s.max_date, e.max_date, DAY) as days_behind
      FROM source_max s, enhanced_max e
    `;
    const [keywordsStaleRows] = await bigquery.query(keywordsStaleQuery);
    const daysBehind = parseInt(keywordsStaleRows[0]?.days_behind || 0);

    checks.push({
      name: 'Keywords Enhanced Freshness',
      passed: daysBehind <= 1,
      message: daysBehind <= 1
        ? 'keywords_enhanced is up to date with source tables'
        : `⚠️ keywords_enhanced is ${daysBehind} days behind source tables`,
      expected: '≤1 day behind',
      actual: `${daysBehind} days behind`
    });

    // GA4 Data Quality Check
    const ga4CheckQuery = `
      SELECT
        SUM(sessions) as total_sessions,
        SUM(ecommercePurchases) as total_purchases,
        SUM(purchaseRevenue) as total_revenue
      FROM (
        SELECT sessions, ecommercePurchases, purchaseRevenue
        FROM \`${PROJECT_ID}.brick_anew_ga4.attribution_channel_performance\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        UNION ALL
        SELECT sessions, ecommercePurchases, purchaseRevenue
        FROM \`${PROJECT_ID}.heatilator_ga4.attribution_channel_performance\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      )
    `;
    const [ga4Rows] = await bigquery.query(ga4CheckQuery);
    const ga4Sessions = parseInt(ga4Rows[0]?.total_sessions || 0);
    const ga4Purchases = parseInt(ga4Rows[0]?.total_purchases || 0);

    checks.push({
      name: 'GA4 Data Quality',
      passed: ga4Sessions > 0 && ga4Purchases >= 0,
      message: ga4Sessions > 0
        ? `GA4 data looks healthy: ${ga4Sessions.toLocaleString()} sessions, ${ga4Purchases} purchases`
        : 'GA4 data missing or incomplete',
      expected: 'Sessions > 0',
      actual: `${ga4Sessions} sessions`
    });

    // ROAS Health Check
    const roasQuery = `
      SELECT
        SUM(ads.total_spend) as total_spend,
        SUM(sales.total_sales) as total_sales
      FROM \`${PROJECT_ID}.MASTER.TOTAL_DAILY_ADS\` ads
      INNER JOIN \`${PROJECT_ID}.MASTER.TOTAL_DAILY_SALES\` sales
        ON ads.date = sales.date
      WHERE ads.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    `;
    const [roasRows] = await bigquery.query(roasQuery);
    const totalSpend = parseFloat(roasRows[0]?.total_spend || 0);
    const totalSales = parseFloat(roasRows[0]?.total_sales || 0);
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;

    checks.push({
      name: 'ROAS Health Check',
      passed: roas > 0,
      message: roas > 0
        ? `7-day ROAS: ${roas.toFixed(2)}x (Revenue: $${totalSales.toFixed(0)}, Spend: $${totalSpend.toFixed(0)})`
        : 'Unable to calculate ROAS - missing data',
      expected: 'ROAS > 0',
      actual: roas > 0 ? `${roas.toFixed(2)}x` : 'N/A'
    });

    // Comprehensive Date Gap Summary Check
    const sourcesWithGaps = Object.values(result.sources).filter(
      s => s.metrics?.dateGaps?.totalMissing > 0
    );

    const criticalGapSources = sourcesWithGaps.filter(
      s => s.metrics?.dateGaps?.recentMissing > 0
    );

    const totalSourcesChecked = Object.values(result.sources).length;
    const sourcesWithRecentGaps = criticalGapSources.length;

    let gapSummaryMessage = '';
    if (sourcesWithRecentGaps === 0 && sourcesWithGaps.length === 0) {
      gapSummaryMessage = `All ${totalSourcesChecked} sources have complete data for the last 30 days`;
    } else if (sourcesWithRecentGaps > 0) {
      gapSummaryMessage = `⚠️ ${sourcesWithRecentGaps} source(s) missing recent data (last 7 days): `;
      gapSummaryMessage += criticalGapSources.map(s =>
        `${s.name} (${s.metrics?.dateGaps?.recentMissing || 0} dates)`
      ).join(', ');
    } else {
      gapSummaryMessage = `${sourcesWithGaps.length} source(s) have older date gaps (>7 days ago)`;
    }

    checks.push({
      name: 'Date Completeness Check',
      passed: sourcesWithRecentGaps === 0,
      message: gapSummaryMessage,
      expected: '0 sources with recent gaps',
      actual: `${sourcesWithRecentGaps} sources with recent gaps, ${sourcesWithGaps.length} total with gaps`
    });

    // Master Table Date Alignment Check
    const masterAlignmentQuery = `
      WITH sales_dates AS (
        SELECT DISTINCT date
        FROM \`${PROJECT_ID}.MASTER.TOTAL_DAILY_SALES\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      ),
      ads_dates AS (
        SELECT DISTINCT date
        FROM \`${PROJECT_ID}.MASTER.TOTAL_DAILY_ADS\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      ),
      date_series AS (
        SELECT date
        FROM UNNEST(GENERATE_DATE_ARRAY(
          DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY),
          CURRENT_DATE()
        )) as date
      )
      SELECT
        COUNT(DISTINCT ds.date) as total_expected_dates,
        COUNT(DISTINCT sd.date) as sales_dates_present,
        COUNT(DISTINCT ad.date) as ads_dates_present,
        COUNT(DISTINCT CASE WHEN sd.date IS NULL THEN ds.date END) as sales_missing,
        COUNT(DISTINCT CASE WHEN ad.date IS NULL THEN ds.date END) as ads_missing,
        STRING_AGG(DISTINCT CASE WHEN sd.date IS NULL THEN CAST(ds.date AS STRING) END, ', ' ORDER BY CAST(ds.date AS STRING)) as sales_missing_dates,
        STRING_AGG(DISTINCT CASE WHEN ad.date IS NULL THEN CAST(ds.date AS STRING) END, ', ' ORDER BY CAST(ds.date AS STRING)) as ads_missing_dates
      FROM date_series ds
      LEFT JOIN sales_dates sd ON ds.date = sd.date
      LEFT JOIN ads_dates ad ON ds.date = ad.date
    `;
    const [alignmentRows] = await bigquery.query(masterAlignmentQuery);
    const salesMissing = parseInt(alignmentRows[0]?.sales_missing || 0);
    const adsMissing = parseInt(alignmentRows[0]?.ads_missing || 0);
    const salesMissingDates = alignmentRows[0]?.sales_missing_dates || '';
    const adsMissingDates = alignmentRows[0]?.ads_missing_dates || '';

    let alignmentMessage = '';
    if (salesMissing === 0 && adsMissing === 0) {
      alignmentMessage = 'MASTER tables have complete data for last 7 days';
    } else {
      const issues = [];
      if (salesMissing > 0) issues.push(`Sales: ${salesMissing} dates (${salesMissingDates})`);
      if (adsMissing > 0) issues.push(`Ads: ${adsMissing} dates (${adsMissingDates})`);
      alignmentMessage = `⚠️ Missing dates in MASTER tables: ${issues.join(' | ')}`;
    }

    checks.push({
      name: 'Master Table Date Alignment',
      passed: salesMissing === 0 && adsMissing === 0,
      message: alignmentMessage,
      expected: '0 missing dates',
      actual: `Sales: ${salesMissing} missing, Ads: ${adsMissing} missing`
    });

    // API Endpoint Data Validation
    try {
      // Test if Amazon Ads API returns campaign data from conversions_orders
      const campaignTestQuery = `
        SELECT COUNT(DISTINCT campaign_name) as campaign_count
        FROM \`${PROJECT_ID}.amazon_ads_sharepoint.conversions_orders\`
        WHERE campaign_name IS NOT NULL
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      `;
      const [campaignTest] = await bigquery.query(campaignTestQuery);
      const campaignCount = parseInt(campaignTest[0]?.campaign_count || 0);

      checks.push({
        name: 'Amazon Ads API Data Availability',
        passed: campaignCount > 0,
        message: campaignCount > 0
          ? `${campaignCount} campaigns available for API consumption`
          : 'No Amazon Ads campaigns found - API will return empty results',
        expected: 'Campaign count > 0',
        actual: `${campaignCount} campaigns`
      });
    } catch (error: any) {
      checks.push({
        name: 'Amazon Ads API Data Availability',
        passed: false,
        message: `Failed to validate API data: ${error.message}`
      });
    }

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
