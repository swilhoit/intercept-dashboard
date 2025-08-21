import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const query = `
      SELECT 
        month,
        amazon_total,
        woocommerce_total,
        total_revenue
      FROM \`intercept-sales-2508061117.MASTER.MONTHLY_SALES_SUMMARY\`
      ORDER BY month DESC
      LIMIT 12
    `;
    
    const [rows] = await bigquery.query(query);
    
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }}