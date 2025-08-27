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
    
    // Get top products for WooCommerce
    const productsQuery = `
      SELECT 
        product_name,
        'WooCommerce' as channel,
        SUM(revenue) as revenue,
        SUM(quantity_sold) as quantity,
        AVG(revenue / NULLIF(quantity_sold, 0)) as avg_price
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_PRODUCTS_DAILY_DETAILED_SALES\`
      WHERE channel = 'WooCommerce' ${whereClause.replace('date', 'order_date')}
      GROUP BY product_name
      ORDER BY revenue DESC
      LIMIT 20
    `;
    
    // Get category data for WooCommerce
    const categoryQuery = `
      SELECT 
        category as name,
        'WooCommerce' as channel,
        SUM(revenue) as revenue,
        SUM(quantity_sold) as quantity,
        COUNT(DISTINCT product_name) as product_count
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_PRODUCTS_DAILY_DETAILED_SALES\`
      WHERE channel = 'WooCommerce' ${whereClause.replace('date', 'order_date')}
      GROUP BY category
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