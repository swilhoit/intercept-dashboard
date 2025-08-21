import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
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
    console.error('Error fetching monthly sales:', error);
    return NextResponse.json({ error: 'Failed to fetch monthly sales' }, { status: 500 });
  }
}