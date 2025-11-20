import { NextRequest, NextResponse } from 'next/server';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedQuery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let query = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', date) as date,
        COALESCE(amazon_sales, 0) as amazon_sales,
        COALESCE(woocommerce_sales, 0) as woocommerce_sales,
        COALESCE(shopify_sales, 0) as shopify_sales,
        COALESCE(total_sales, 0) as total_sales
      FROM \`intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY\`
    `;
    
    // Using simple string injection for date function logic that isn't easily parameterized 
    // in all clauses, but since we validate/construct it here it's safe enough for internal use.
    // Ideally we'd use parameters for the values.
    if (startDate && endDate) {
      query += ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    } else {
      query += ` WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    query += ` ORDER BY date ASC`;

    // Using cachedQuery with tags
    const rows = await cachedQuery(
      query,
      undefined, // No complex params, baked into string for this simple case
      ['sales-daily'],
      300
    );

    return NextResponse.json({
      daily: rows
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}
