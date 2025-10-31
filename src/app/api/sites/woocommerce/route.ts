import { NextRequest } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let whereClause = '';
    let wooWhereClause = '';
    if (startDate && endDate) {
      whereClause = `AND date >= '${startDate}' AND date <= '${endDate}'`;
      wooWhereClause = `AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }
    
    const consolidatedQuery = `
      WITH summary AS (
        SELECT 
          SUM(woocommerce_sales) as total_revenue,
          AVG(woocommerce_sales) as avg_daily_sales,
          COUNT(DISTINCT date) as days_with_sales,
          COUNT(DISTINCT CASE WHEN woocommerce_sales > 0 THEN date END) as active_days,
          MAX(woocommerce_sales) as highest_day,
          MIN(CASE WHEN woocommerce_sales > 0 THEN woocommerce_sales END) as lowest_day
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
        WHERE woocommerce_sales > 0 ${whereClause}
      ),
      daily AS (
        SELECT date, woocommerce_sales as sales
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
        WHERE woocommerce_sales > 0 ${whereClause}
      ),
      monthly AS (
        SELECT FORMAT_DATE('%Y-%m', date) as month, SUM(woocommerce_sales) as sales
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
        WHERE woocommerce_sales > 0 ${whereClause}
        GROUP BY month
      ),
      all_woo_products AS (
        SELECT product_name, 'BrickAnew' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\` WHERE 1=1 ${wooWhereClause} UNION ALL
        SELECT product_name, 'Heatilator' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\` WHERE 1=1 ${wooWhereClause} UNION ALL
        SELECT product_name, 'Superior' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\` WHERE 1=1 ${wooWhereClause} UNION ALL
        SELECT product_name, 'Majestic' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\` WHERE 1=1 ${wooWhereClause}
      ),
      products AS (
        SELECT product_name, SUM(total_revenue) as revenue, SUM(total_quantity_sold) as quantity
        FROM all_woo_products GROUP BY product_name
      ),
      categories AS (
        SELECT
          CASE
            WHEN UPPER(product_name) LIKE '%FIREPLACE%' THEN 'Fireplace Doors'
            WHEN UPPER(product_name) LIKE '%PAINT%' THEN 'Paint Products'
            ELSE 'Other'
          END as name,
          SUM(total_revenue) as revenue,
          SUM(total_quantity_sold) as quantity,
          COUNT(DISTINCT product_name) as product_count
        FROM all_woo_products GROUP BY name
      ),
      site_breakdown AS (
        SELECT
          site,
          SUM(total_revenue) as revenue,
          COUNT(DISTINCT order_date) as active_days,
          COUNT(DISTINCT product_name) as products
        FROM all_woo_products
        GROUP BY site
      ),
      shopify_breakdown AS (
        SELECT
          'WaterWise' as site,
          SUM(total_revenue) as revenue,
          COUNT(DISTINCT order_date) as active_days,
          COUNT(DISTINCT product_name) as products
        FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
        WHERE 1=1 ${wooWhereClause.replace('order_date', 'order_date')}
      )
      SELECT
        (SELECT TO_JSON_STRING(s) FROM summary s) as summary,
        (SELECT TO_JSON_STRING(ARRAY_AGG(d ORDER BY date DESC LIMIT 90)) FROM daily d) as daily,
        (SELECT TO_JSON_STRING(ARRAY_AGG(m ORDER BY month DESC LIMIT 12)) FROM monthly m) as monthly,
        (SELECT TO_JSON_STRING(ARRAY_AGG(p ORDER BY revenue DESC LIMIT 20)) FROM products p) as products,
        (SELECT TO_JSON_STRING(ARRAY_AGG(c ORDER BY revenue DESC LIMIT 10)) FROM categories c) as categories,
        (SELECT TO_JSON_STRING(ARRAY_AGG(sb ORDER BY revenue DESC)) FROM (SELECT * FROM site_breakdown UNION ALL SELECT * FROM shopify_breakdown) sb) as siteBreakdown
    `;
    
    const cacheKey = `sites-woocommerce-${startDate || 'default'}-${endDate || 'default'}`;

    const data = await cachedResponse(
      cacheKey,
      consolidatedQuery,
      CACHE_STRATEGIES.STANDARD
    ).then(res => res.json());

    const resultRow = data[0] || {};
    const summaryData = JSON.parse(resultRow.summary || '{}');

    const response = {
      summary: summaryData,
      daily: JSON.parse(resultRow.daily || '[]'),
      monthly: JSON.parse(resultRow.monthly || '[]'),
      products: JSON.parse(resultRow.products || '[]'),
      categories: JSON.parse(resultRow.categories || '[]'),
      siteBreakdown: JSON.parse(resultRow.siteBreakdown || '[]'),
      metrics: {
        total_revenue: summaryData.total_revenue || 0,
        avg_daily_sales: summaryData.avg_daily_sales || 0,
        days_with_sales: summaryData.days_with_sales || 0,
        active_days: summaryData.active_days || 0
      }
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleApiError(error);
  }
}