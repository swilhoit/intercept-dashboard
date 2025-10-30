import { NextRequest } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';
import { calculatePreviousPeriod, calculatePercentageChange } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Date range is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const previousPeriod = calculatePreviousPeriod(startDate, endDate);

    const buildQuery = (start: string, end: string) => `
      WITH master_data AS (
        SELECT
          SUM(total_sales) as total_revenue,
          AVG(total_sales) as avg_daily_sales,
          COUNT(DISTINCT date) as days_with_sales,
          SUM(amazon_sales) as amazon_revenue,
          SUM(woocommerce_sales) as woocommerce_revenue,
          SUM(shopify_sales) as shopify_revenue,
          MAX(total_sales) as highest_day,
          MIN(CASE WHEN total_sales > 0 THEN total_sales END) as lowest_day
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
        WHERE date >= '${start}' AND date <= '${end}'
      ),
      organic_clicks AS (
        SELECT SUM(clicks) as total_clicks
        FROM (
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_brickanew.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_heatilator.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_superior.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_waterwise.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_majestic.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacepainting.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacesnet.searchdata_site_impression\` WHERE data_date >= '${start}' AND data_date <= '${end}'
        ) all_clicks
      ),
      order_counts AS (
        SELECT
          COALESCE(SUM(amazon_conversions), 0) as amazon_orders,
          COALESCE(SUM(woo_orders), 0) as woo_orders,
          COALESCE(SUM(shopify_orders), 0) as shopify_orders
        FROM (
          -- Amazon orders from conversions
          SELECT
            SUM(conversions_1d_total) as amazon_conversions,
            0 as woo_orders,
            0 as shopify_orders
          FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders\`
          WHERE date >= '${start}' AND date <= '${end}'

          UNION ALL

          -- WooCommerce orders
          SELECT
            0 as amazon_conversions,
            SUM(order_count) as woo_orders,
            0 as shopify_orders
          FROM (
            SELECT SUM(order_count) as order_count FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\` WHERE order_date >= '${start}' AND order_date <= '${end}'
            UNION ALL
            SELECT SUM(order_count) as order_count FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\` WHERE order_date >= '${start}' AND order_date <= '${end}'
            UNION ALL
            SELECT SUM(order_count) as order_count FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\` WHERE order_date >= '${start}' AND order_date <= '${end}'
            UNION ALL
            SELECT SUM(order_count) as order_count FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\` WHERE order_date >= '${start}' AND order_date <= '${end}'
            UNION ALL
            SELECT SUM(order_count) as order_count FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\` WHERE order_date >= '${start}' AND order_date <= '${end}'
          ) woo_all
        )
      )
      SELECT
        m.total_revenue,
        m.avg_daily_sales,
        m.days_with_sales,
        m.amazon_revenue,
        m.woocommerce_revenue,
        m.shopify_revenue,
        m.highest_day,
        m.lowest_day,
        oc.total_clicks as organic_clicks,
        (ord.amazon_orders + ord.woo_orders + ord.shopify_orders) as total_orders
      FROM master_data m,
           organic_clicks oc,
           order_counts ord
    `;

    const currentPeriodQuery = buildQuery(startDate, endDate);
    const previousPeriodQuery = buildQuery(previousPeriod.startDate, previousPeriod.endDate);
    
    // Use a unique cache key based on the date range
    const cacheKey = `sales-summary-${startDate}-${endDate}`;
    
    const [currentData, previousData] = await Promise.all([
      cachedResponse(`current-${cacheKey}`, currentPeriodQuery, CACHE_STRATEGIES.STANDARD).then(res => res.json()),
      cachedResponse(`previous-${cacheKey}`, previousPeriodQuery, CACHE_STRATEGIES.STATIC).then(res => res.json())
    ]);

    const current = currentData[0] || {};
    const previous = previousData[0] || {};
    
    const percentageChanges = {
      total_revenue: calculatePercentageChange(current.total_revenue, previous.total_revenue),
      avg_daily_sales: calculatePercentageChange(current.avg_daily_sales, previous.avg_daily_sales),
      amazon_revenue: calculatePercentageChange(current.amazon_revenue, previous.amazon_revenue),
      woocommerce_revenue: calculatePercentageChange(current.woocommerce_revenue, previous.woocommerce_revenue),
      shopify_revenue: calculatePercentageChange(current.shopify_revenue, previous.shopify_revenue),
      organic_clicks: calculatePercentageChange(current.organic_clicks, previous.organic_clicks),
      total_orders: calculatePercentageChange(current.total_orders, previous.total_orders),
    };

    const response = {
      current_period: current,
      previous_period: previous,
      percentage_changes: percentageChanges,
      has_comparison: true,
      _timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        // We don't need to set cache headers here as cachedResponse does it
      },
    });

  } catch (error) {
    return handleApiError(error);
  }
}