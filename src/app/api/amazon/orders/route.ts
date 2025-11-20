import { NextResponse } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedQuery } from '@/lib/bigquery';

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

    const rows = await cachedQuery(
      query,
      undefined,
      ['amazon-orders'],
      300
    );

    return new Response(JSON.stringify(rows), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
