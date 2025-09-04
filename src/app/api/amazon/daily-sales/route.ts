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
      // Convert dates to Excel serial format for filtering
      whereClause += ` AND DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) >= '${startDate}' AND DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) <= '${endDate}'`;
    }
    
    const query = `
      SELECT 
        DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) as date,
        COUNT(*) as order_count,
        SUM(Item_Price) as total_sales,
        ROUND(AVG(Item_Price), 2) as avg_order_value
      FROM \`amazon_seller.amazon_orders_2025\`
      ${whereClause}
      GROUP BY DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
      ORDER BY date DESC
      LIMIT 100
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.REALTIME);
  } catch (error) {
    return handleApiError(error);
  }
}