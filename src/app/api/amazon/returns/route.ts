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
    const groupBy = searchParams.get('groupBy') || 'day'; // day, week, month

    // Build date filtering
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND return_date >= TIMESTAMP('${startDate}') AND return_date <= TIMESTAMP('${endDate}')`;
    }

    // Build date formatting based on groupBy
    let dateFormat = 'DATE(return_date)';
    let dateGrouping = 'DATE(return_date)';
    
    if (groupBy === 'week') {
      dateFormat = 'DATE_TRUNC(DATE(return_date), WEEK)';
      dateGrouping = 'DATE_TRUNC(DATE(return_date), WEEK)';
    } else if (groupBy === 'month') {
      dateFormat = 'DATE_TRUNC(DATE(return_date), MONTH)';
      dateGrouping = 'DATE_TRUNC(DATE(return_date), MONTH)';
    }

    const query = `
      WITH returns_summary AS (
        SELECT
          COUNT(*) as total_returns,
          COUNT(DISTINCT order_id) as affected_orders,
          COUNT(DISTINCT asin) as affected_products,
          SUM(return_quantity) as total_units_returned,
          SUM(refund_amount) as total_refund_amount,
          ROUND(AVG(refund_amount), 2) as avg_refund_amount,
          ROUND(AVG(days_to_return), 1) as avg_days_to_return
        FROM \`intercept-sales-2508061117.amazon_seller.returns\`
        WHERE return_date IS NOT NULL ${dateFilter}
      ),
      returns_by_date AS (
        SELECT
          ${dateFormat} as date,
          COUNT(*) as return_count,
          SUM(return_quantity) as units_returned,
          SUM(refund_amount) as refund_amount
        FROM \`intercept-sales-2508061117.amazon_seller.returns\`
        WHERE return_date IS NOT NULL ${dateFilter}
        GROUP BY ${dateGrouping}
        ORDER BY date DESC
      ),
      top_returned_products AS (
        SELECT
          asin,
          product_name,
          COUNT(*) as return_count,
          SUM(return_quantity) as units_returned,
          SUM(refund_amount) as total_refunds,
          ROUND(AVG(refund_amount), 2) as avg_refund
        FROM \`intercept-sales-2508061117.amazon_seller.returns\`
        WHERE return_date IS NOT NULL 
          AND asin IS NOT NULL 
          AND asin != '' ${dateFilter}
        GROUP BY asin, product_name
        ORDER BY return_count DESC
        LIMIT 20
      ),
      return_reasons AS (
        SELECT
          return_reason,
          COUNT(*) as count,
          SUM(refund_amount) as total_refunds,
          ROUND(AVG(refund_amount), 2) as avg_refund
        FROM \`intercept-sales-2508061117.amazon_seller.returns\`
        WHERE return_date IS NOT NULL 
          AND return_reason IS NOT NULL 
          AND return_reason != '' ${dateFilter}
        GROUP BY return_reason
        ORDER BY count DESC
        LIMIT 10
      )
      SELECT
        (SELECT TO_JSON_STRING(s) FROM returns_summary s) as summary,
        (SELECT TO_JSON_STRING(ARRAY_AGG(d ORDER BY date DESC)) FROM returns_by_date d) as time_series,
        (SELECT TO_JSON_STRING(ARRAY_AGG(p ORDER BY return_count DESC)) FROM top_returned_products p) as top_products,
        (SELECT TO_JSON_STRING(ARRAY_AGG(r ORDER BY count DESC)) FROM return_reasons r) as reasons
    `;

    const cacheKey = `amazon-returns-${startDate || 'all'}-${endDate || 'all'}-${groupBy}`;

    const data = await cachedResponse(
      cacheKey,
      query,
      CACHE_STRATEGIES.STANDARD
    ).then(res => res.json());

    const resultRow = data[0] || {};

    const response = {
      summary: JSON.parse(resultRow.summary || '{}'),
      timeSeries: JSON.parse(resultRow.time_series || '[]'),
      topProducts: JSON.parse(resultRow.top_products || '[]'),
      reasons: JSON.parse(resultRow.reasons || '[]'),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleApiError(error);
  }
}

