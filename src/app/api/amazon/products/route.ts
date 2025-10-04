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
    
    let whereClause = 'WHERE Date IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0';
    if (startDate && endDate) {
      // Handle both Excel serial numbers and string dates
      whereClause += ` AND (
        (SAFE_CAST(Date AS INT64) IS NOT NULL AND DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) >= '${startDate}' AND DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) <= '${endDate}') OR
        (SAFE_CAST(Date AS INT64) IS NULL AND Date >= '${startDate}' AND Date <= '${endDate}')
      )`;
    }
    
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
      ${whereClause}
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