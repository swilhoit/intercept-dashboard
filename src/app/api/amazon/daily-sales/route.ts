import { NextRequest } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const query = `
      WITH combined_amazon AS (
        -- Combined data from both Amazon sources, avoiding overlap
        -- amazon_seller is more current (Jan 1 2025 - Nov 13 2025)
        -- orders_jan only for dates before 2025-01-01
        SELECT
          product_name,
          revenue,
          order_date
        FROM (
          -- Recent data from amazon_seller table (2025 onwards)
          SELECT
            Product_Name as product_name,
            Item_Price as revenue,
            CASE
              WHEN REGEXP_CONTAINS(Date, r'^\\d{4}-\\d{2}-\\d{2}$') THEN PARSE_DATE('%Y-%m-%d', Date)
              WHEN REGEXP_CONTAINS(Date, r'^\\d+$') THEN DATE_ADD(DATE '1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
              ELSE NULL
            END as order_date
          FROM \`intercept-sales-2508061117.amazon_seller.amazon_orders_2025\`
          WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0

          UNION ALL

          -- Historical data from amazon orders table (before 2025)
          SELECT
            product_name,
            revenue,
            DATE(date) as order_date
          FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
          WHERE product_name IS NOT NULL
            AND revenue IS NOT NULL
            AND revenue > 0
            AND DATE(date) < '2025-01-01'
        )
      )
      SELECT
        order_date as date,
        COUNT(*) as order_count,
        SUM(revenue) as total_sales,
        ROUND(AVG(revenue), 2) as avg_order_value
      FROM combined_amazon
      WHERE order_date IS NOT NULL
      ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      GROUP BY order_date
      ORDER BY order_date DESC
      LIMIT 100
    `;

    const cacheKey = `amazon-daily-sales-${startDate || 'default'}-${endDate || 'default'}`;
    
    return await cachedResponse(
      cacheKey,
      query,
      CACHE_STRATEGIES.REALTIME
    );
  } catch (error) {
    return handleApiError(error);
  }
}