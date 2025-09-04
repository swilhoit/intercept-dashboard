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
        ASIN,
        Product_Name as product_name,
        COUNT(*) as order_count,
        SUM(Item_Price) as total_sales,
        ROUND(AVG(Item_Price), 2) as avg_price,
        MIN(Item_Price) as min_price,
        MAX(Item_Price) as max_price
      FROM \`amazon_seller.amazon_orders_2025\`
      WHERE Date IS NOT NULL 
        AND Item_Price IS NOT NULL
        AND Item_Price > 0
      GROUP BY ASIN, Product_Name
      ORDER BY total_sales DESC
      LIMIT 50
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.STANDARD);
  } catch (error) {
    return handleApiError(error);
  }
}