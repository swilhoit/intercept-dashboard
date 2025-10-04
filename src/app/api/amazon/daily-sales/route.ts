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
        CASE
          WHEN SAFE_CAST(Date AS INT64) IS NOT NULL THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
          ELSE PARSE_DATE('%Y-%m-%d', Date)
        END as date,
        COUNT(*) as order_count,
        SUM(Item_Price) as total_sales,
        ROUND(AVG(Item_Price), 2) as avg_order_value
      FROM \`amazon_seller.amazon_orders_2025\`
      ${whereClause}
      GROUP BY
        CASE
          WHEN SAFE_CAST(Date AS INT64) IS NOT NULL THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
          ELSE PARSE_DATE('%Y-%m-%d', Date)
        END
      ORDER BY date DESC
      LIMIT 100
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.REALTIME);
  } catch (error) {
    return handleApiError(error);
  }
}