import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

const SITE_TABLE_MAP: Record<string, string> = {
  brickanew: 'woocommerce.brickanew_daily_product_sales',
  heatilator: 'woocommerce.heatilator_daily_product_sales',
  superior: 'woocommerce.superior_daily_product_sales',
  majestic: 'woocommerce.majestic_daily_product_sales',
  waterwise: 'shopify.waterwise_daily_product_sales_clean'
};

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const site = searchParams.get('site') || 'brickanew';

    const tableName = SITE_TABLE_MAP[site];
    if (!tableName) {
      return NextResponse.json({ error: 'Invalid site parameter' }, { status: 400 });
    }

    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `WHERE order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }

    // Determine channel based on site (Shopify or WooCommerce)
    const channel = site === 'waterwise' ? 'Shopify' : 'WooCommerce';

    const query = `
      SELECT
        product_name,
        '${channel}' as channel,
        SUM(total_revenue) as total_sales,
        SUM(total_quantity_sold) as quantity
      FROM \`intercept-sales-2508061117.${tableName}\`
      ${dateFilter}
      GROUP BY product_name
      ORDER BY total_sales DESC
      LIMIT 100
    `;

    const [rows] = await bigquery.query(query);
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }
}
