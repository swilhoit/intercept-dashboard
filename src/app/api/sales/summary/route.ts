import { NextRequest } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedQuery } from '@/lib/bigquery';
import { calculatePreviousPeriod, calculatePercentageChange } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'Date range is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const previousPeriod = calculatePreviousPeriod(startDate, endDate);

    const buildQuery = (start: string, end: string) => `
      SELECT
        SUM(total_sales) as total_revenue,
        AVG(total_sales) as avg_daily_sales,
        COUNT(DISTINCT date) as days_with_sales,
        SUM(amazon_sales) as amazon_revenue,
        SUM(woocommerce_sales) as woocommerce_revenue,
        SUM(shopify_sales) as shopify_revenue,
        MAX(total_sales) as highest_day,
        MIN(CASE WHEN total_sales > 0 THEN total_sales END) as lowest_day,
        SUM(organic_clicks) as organic_clicks,
        SUM(total_orders) as total_orders
      FROM \`intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY\`
      WHERE date >= @startDate AND date <= @endDate
    `;

    const currentQuery = buildQuery(startDate, endDate);
    const previousQuery = buildQuery(previousPeriod.startDate, previousPeriod.endDate);
    
    // Execute queries in parallel with native caching
    const [currentData, previousData] = await Promise.all([
      cachedQuery<any>(
        currentQuery, 
        { startDate, endDate }, 
        ['sales-summary', 'current-period'], 
        300 // 5 minutes
      ),
      cachedQuery<any>(
        previousQuery, 
        { startDate: previousPeriod.startDate, endDate: previousPeriod.endDate }, 
        ['sales-summary', 'previous-period'], 
        3600 // 1 hour (previous periods don't change often)
      )
    ]);

    const current = currentData[0] || {};
    const previous = previousData[0] || {};
    
    const percentageChanges = {
      total_revenue: calculatePercentageChange(current.total_revenue, previous.total_revenue),
      avg_daily_sales: calculatePercentageChange(current.avg_daily_sales, previous.avg_daily_sales),
      amazon_revenue: calculatePercentageChange(current.amazon_revenue, previous.amazon_revenue),
      woocommerce_revenue: calculatePercentageChange(current.woocommerce_revenue, previous.woocommerce_revenue),
      shopify_revenue: calculatePercentageChange(current.shopify_revenue, previous.shopify_revenue),
      organic_clicks: calculatePercentageChange(current.organic_clicks, previous.organic_clicks),
      total_orders: calculatePercentageChange(current.total_orders, previous.total_orders),
    };

    const response = {
      current_period: current,
      previous_period: previous,
      percentage_changes: percentageChanges,
      has_comparison: true,
      _timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      },
    });

  } catch (error) {
    return handleApiError(error);
  }
}
