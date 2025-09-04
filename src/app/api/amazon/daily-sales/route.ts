import { NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';

export async function GET() {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const query = `
      SELECT 
        DATE(PARSE_DATE('%Y%m%d', CAST(CAST(Date AS INT64) AS STRING))) as date,
        COUNT(*) as order_count,
        SUM(Item_Price) as total_sales,
        ROUND(AVG(Item_Price), 2) as avg_order_value
      FROM \`amazon_seller.amazon_orders_2025\`
      WHERE Date IS NOT NULL 
        AND Item_Price IS NOT NULL
        AND Item_Price > 0
      GROUP BY DATE(PARSE_DATE('%Y%m%d', CAST(CAST(Date AS INT64) AS STRING)))
      ORDER BY date DESC
      LIMIT 100
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.REALTIME);
  } catch (error) {
    return handleApiError(error);
  }
}