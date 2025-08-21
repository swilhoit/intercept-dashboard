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
    const channel = searchParams.get('channel');
    
    // Build query based on channel selection
    let queries = [];
    
    if (!channel || channel === 'all' || channel === 'Amazon') {
      let amazonQuery = `
        SELECT 
          product_name,
          'Amazon' as channel,
          SUM(revenue) as total_sales,
          SUM(item_quantity) as quantity
        FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
        WHERE product_name IS NOT NULL
      `;
      
      if (startDate && endDate) {
        amazonQuery += ` AND DATE(date) >= '${startDate}' AND DATE(date) <= '${endDate}'`;
      }
      
      amazonQuery += `
        GROUP BY product_name
      `;
      
      queries.push(amazonQuery);
    }
    
    if (!channel || channel === 'all' || channel === 'WooCommerce') {
      let wooQuery = `
        SELECT 
          product_name,
          'WooCommerce' as channel,
          SUM(total_revenue) as total_sales,
          SUM(total_quantity_sold) as quantity
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE product_name IS NOT NULL
      `;
      
      if (startDate && endDate) {
        wooQuery += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
      }
      
      wooQuery += `
        GROUP BY product_name
      `;
      
      queries.push(wooQuery);
    }
    
    // Combine queries with UNION ALL if we have multiple
    let finalQuery = '';
    if (queries.length > 1) {
      finalQuery = queries.join(' UNION ALL ');
      finalQuery = `
        SELECT * FROM (
          ${finalQuery}
        )
        ORDER BY total_sales DESC
        LIMIT 50
      `;
    } else if (queries.length === 1) {
      finalQuery = queries[0] + ' ORDER BY total_sales DESC LIMIT 50';
    } else {
      return NextResponse.json([]);
    }
    
    const [rows] = await bigquery.query(finalQuery);
    
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }}