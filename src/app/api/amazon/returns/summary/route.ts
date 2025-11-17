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

    // Build date filtering - use DATE() to compare dates properly
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND DATE(return_date) >= '${startDate}' AND DATE(return_date) <= '${endDate}'`;
    }

    const query = `
      SELECT
        COUNT(*) as total_returns,
        COUNT(DISTINCT order_id) as affected_orders,
        SUM(return_quantity) as total_units_returned,
        SUM(refund_amount) as total_refund_amount,
        ROUND(AVG(refund_amount), 2) as avg_refund_amount,
        ROUND(AVG(days_to_return), 1) as avg_days_to_return,
        MIN(return_date) as earliest_return,
        MAX(return_date) as latest_return
      FROM \`intercept-sales-2508061117.amazon_seller.returns\`
      WHERE return_date IS NOT NULL ${dateFilter}
    `;

    const cacheKey = `amazon-returns-summary-${startDate || 'all'}-${endDate || 'all'}`;

    const data = await cachedResponse(
      cacheKey,
      query,
      CACHE_STRATEGIES.STANDARD
    ).then(res => res.json());

    const summary = data[0] || {
      total_returns: 0,
      affected_orders: 0,
      total_units_returned: 0,
      total_refund_amount: 0,
      avg_refund_amount: 0,
      avg_days_to_return: 0,
      earliest_return: null,
      latest_return: null
    };

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleApiError(error);
  }
}

