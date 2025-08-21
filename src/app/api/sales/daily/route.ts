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
    
    let query = `
      SELECT 
        FORMAT_DATE('%Y-%m-%d', date) as date,
        COALESCE(amazon_sales, 0) as amazon_sales,
        COALESCE(woocommerce_sales, 0) as woocommerce_sales,
        COALESCE(total_sales, 0) as total_sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
    `;
    
    if (startDate && endDate) {
      query += ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    } else {
      query += ` WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    query += ` ORDER BY date ASC`;
    
    const [rows] = await bigquery.query(query);
    
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }}