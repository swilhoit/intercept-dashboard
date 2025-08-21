import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let whereClause = '';
    if (startDate && endDate) {
      whereClause = ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    const query = `
      SELECT 
        SUM(total_sales) as total_revenue,
        AVG(total_sales) as avg_daily_sales,
        COUNT(DISTINCT date) as days_with_sales,
        SUM(amazon_sales) as amazon_revenue,
        SUM(woocommerce_sales) as woocommerce_revenue,
        MAX(total_sales) as highest_day,
        MIN(total_sales) as lowest_day
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      ${whereClause}
    `;
    
    const [rows] = await bigquery.query(query);
    
    return NextResponse.json(rows[0] || {});
  } catch (error) {
    return handleApiError(error);
  }}