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
    const aggregation = searchParams.get('aggregation') || 'daily';
    
    let dateFormat = '';
    let dateGroupBy = '';
    
    switch(aggregation) {
      case 'daily':
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", date)';
        dateGroupBy = 'date';
        break;
      case 'weekly':
        dateFormat = 'FORMAT_DATE("%Y-W%U", DATE_TRUNC(date, WEEK))';
        dateGroupBy = 'DATE_TRUNC(date, WEEK)';
        break;
      case 'monthly':
        dateFormat = 'FORMAT_DATE("%Y-%m", DATE_TRUNC(date, MONTH))';
        dateGroupBy = 'DATE_TRUNC(date, MONTH)';
        break;
      default:
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", date)';
        dateGroupBy = 'date';
    }
    
    let query = `
      SELECT
        ${dateFormat} as period,
        ${aggregation === 'daily' ? 'date' : dateGroupBy} as date,
        SUM(amazon_sales) as amazon_sales,
        SUM(woocommerce_sales) as woocommerce_sales,
        SUM(shopify_sales) as shopify_sales,
        SUM(total_sales) as total_sales,
        COUNT(*) as days_in_period
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
    `;
    
    if (startDate && endDate) {
      query += ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    } else {
      query += ` WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    query += ` GROUP BY period, ${aggregation === 'daily' ? 'date' : dateGroupBy}`;
    query += ` ORDER BY ${aggregation === 'daily' ? 'date' : dateGroupBy} ASC`;
    
    const [rows] = await bigquery.query(query);
    
    // Format the response
    const formattedRows = rows.map((row: any) => ({
      ...row,
      date: row.date || row.period,
      amazon_sales: row.amazon_sales || 0,
      woocommerce_sales: row.woocommerce_sales || 0,
      shopify_sales: row.shopify_sales || 0,
      total_sales: row.total_sales || 0
    }));
    
    return NextResponse.json(formattedRows);
  } catch (error) {
    return handleApiError(error);
  }
}