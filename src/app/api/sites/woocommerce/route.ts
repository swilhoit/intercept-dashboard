import { NextRequest, NextResponse } from 'next/server';
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
    
    let whereClause = '';
    if (startDate && endDate) {
      whereClause = ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    // Get WooCommerce sales summary
    const summaryQuery = `
      SELECT 
        SUM(woocommerce_sales) as total_revenue,
        AVG(woocommerce_sales) as avg_daily_sales,
        COUNT(DISTINCT date) as days_with_sales,
        COUNT(DISTINCT CASE WHEN woocommerce_sales > 0 THEN date END) as active_days,
        MAX(woocommerce_sales) as highest_day,
        MIN(CASE WHEN woocommerce_sales > 0 THEN woocommerce_sales END) as lowest_day
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE woocommerce_sales > 0 ${whereClause}
    `;
    
    // Get daily sales data
    const dailyQuery = `
      SELECT 
        date,
        woocommerce_sales as sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE woocommerce_sales > 0 ${whereClause}
      ORDER BY date DESC
      LIMIT 90
    `;
    
    // Get monthly aggregated data
    const monthlyQuery = `
      SELECT 
        FORMAT_DATE('%Y-%m', date) as date,
        SUM(woocommerce_sales) as sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE woocommerce_sales > 0 ${whereClause}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 12
    `;
    
    // Get top products for WooCommerce from actual table
    const productsQuery = `
      SELECT 
        product_name,
        'WooCommerce' as channel,
        SUM(total_revenue) as revenue,
        SUM(total_quantity_sold) as quantity,
        AVG(avg_unit_price) as avg_price
      FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
      WHERE 1=1 ${whereClause.replace('date', 'order_date')}
      GROUP BY product_name
      ORDER BY revenue DESC
      LIMIT 20
    `;
    
    // Get category data for WooCommerce - create basic categories from product names
    const categoryQuery = `
      SELECT 
        CASE 
          WHEN UPPER(product_name) LIKE '%FIREPLACE%' OR UPPER(product_name) LIKE '%DOOR%' THEN 'Fireplace Doors'
          WHEN UPPER(product_name) LIKE '%PAINT%' OR UPPER(product_name) LIKE '%ROLLER%' THEN 'Paint Products'
          WHEN UPPER(product_name) LIKE '%BELT%' OR UPPER(product_name) LIKE '%GRAB%' THEN 'Automotive'
          ELSE 'Other'
        END as name,
        'WooCommerce' as channel,
        SUM(total_revenue) as revenue,
        SUM(total_quantity_sold) as quantity,
        COUNT(DISTINCT product_name) as product_count
      FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
      WHERE 1=1 ${whereClause.replace('date', 'order_date')}
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 10
    `;
    
    const [summaryRows] = await bigquery.query(summaryQuery);
    const [dailyRows] = await bigquery.query(dailyQuery);
    const [monthlyRows] = await bigquery.query(monthlyQuery);
    const [productRows] = await bigquery.query(productsQuery);
    const [categoryRows] = await bigquery.query(categoryQuery);
    
    const response = {
      summary: summaryRows[0] || {},
      daily: dailyRows,
      monthly: monthlyRows,
      products: productRows,
      categories: categoryRows,
      metrics: {
        total_revenue: summaryRows[0]?.total_revenue || 0,
        avg_daily_sales: summaryRows[0]?.avg_daily_sales || 0,
        days_with_sales: summaryRows[0]?.days_with_sales || 0,
        active_days: summaryRows[0]?.active_days || 0
      }
    };
    
    return cachedResponse(response, CACHE_STRATEGIES.STANDARD);
  } catch (error) {
    return handleApiError(error);
  }
}