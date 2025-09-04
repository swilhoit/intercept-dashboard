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
        ASIN,
        Item_Price as price,
        Product_Name as product_name,
        PARSE_DATETIME('%Y-%m-%dT%H:%M:%E*S%Ez', Purchase_Date) as purchase_date
      FROM \`amazon_seller.amazon_orders_2025\`
      WHERE Date IS NOT NULL 
        AND Item_Price IS NOT NULL
      ORDER BY Purchase_Date DESC
      LIMIT 1000
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.STANDARD);
  } catch (error) {
    return handleApiError(error);
  }
}