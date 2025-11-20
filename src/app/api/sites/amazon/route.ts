import { NextRequest } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedQuery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let whereClause = '';
    if (startDate && endDate) {
      whereClause = `AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    const consolidatedQuery = `
      WITH summary AS (
        SELECT 
          SUM(amazon_sales) as total_revenue,
          AVG(amazon_sales) as avg_daily_sales,
          COUNT(DISTINCT date) as days_with_sales,
          COUNT(DISTINCT CASE WHEN amazon_sales > 0 THEN date END) as active_days,
          MAX(amazon_sales) as highest_day,
          MIN(CASE WHEN amazon_sales > 0 THEN amazon_sales END) as lowest_day
        FROM \`intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY\`
        WHERE amazon_sales > 0 ${whereClause}
      ),
      daily AS (
        SELECT date, amazon_sales as sales
        FROM \`intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY\`
        WHERE amazon_sales > 0 ${whereClause}
      ),
      monthly AS (
        SELECT FORMAT_DATE('%Y-%m', date) as month, SUM(amazon_sales) as sales
        FROM \`intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY\`
        WHERE amazon_sales > 0 ${whereClause}
        GROUP BY month
      ),
      products AS (
        SELECT product_name, SUM(revenue) as revenue, SUM(quantity) as quantity
        FROM \`intercept-sales-2508061117.VIEWS.ALL_AMAZON_SALES\`
        WHERE 1=1 ${whereClause.replace('date', 'order_date')}
        GROUP BY product_name
      ),
      categories AS (
        -- Approximate category logic for Amazon products if not available in source
        SELECT 'Amazon Products' as name, SUM(revenue) as revenue, SUM(quantity) as quantity, COUNT(DISTINCT product_name) as product_count
        FROM \`intercept-sales-2508061117.VIEWS.ALL_AMAZON_SALES\`
        WHERE 1=1 ${whereClause.replace('date', 'order_date')}
      )
      SELECT
        (SELECT TO_JSON_STRING(s) FROM summary s) as summary,
        (SELECT TO_JSON_STRING(ARRAY_AGG(d ORDER BY date DESC LIMIT 90)) FROM daily d) as daily,
        (SELECT TO_JSON_STRING(ARRAY_AGG(m ORDER BY month DESC LIMIT 12)) FROM monthly m) as monthly,
        (SELECT TO_JSON_STRING(ARRAY_AGG(p ORDER BY revenue DESC LIMIT 20)) FROM products p) as products,
        (SELECT TO_JSON_STRING(ARRAY_AGG(c ORDER BY revenue DESC LIMIT 10)) FROM categories c) as categories
    `;

    const data = await cachedQuery<any>(
      consolidatedQuery,
      undefined,
      ['sites-amazon'],
      300
    );

    const resultRow = data[0] || {};
    const summaryData = JSON.parse(resultRow.summary || '{}');

    const response = {
      summary: summaryData,
      daily: JSON.parse(resultRow.daily || '[]'),
      monthly: JSON.parse(resultRow.monthly || '[]'),
      products: JSON.parse(resultRow.products || '[]'),
      categories: JSON.parse(resultRow.categories || '[]'),
      metrics: {
        total_revenue: summaryData.total_revenue || 0,
        avg_daily_sales: summaryData.avg_daily_sales || 0,
        days_with_sales: summaryData.days_with_sales || 0,
        active_days: summaryData.active_days || 0
      }
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      },
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}
