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
    let wooWhereClause = '';
    if (startDate && endDate) {
      whereClause = ` AND date >= '${startDate}' AND date <= '${endDate}'`;
      wooWhereClause = ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }
    
    // Get WooCommerce + Shopify sales summary (combined website sales)
    const summaryQuery = `
      SELECT 
        SUM(COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) as total_revenue,
        AVG(COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) as avg_daily_sales,
        COUNT(DISTINCT date) as days_with_sales,
        COUNT(DISTINCT CASE WHEN (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) > 0 THEN date END) as active_days,
        MAX(COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) as highest_day,
        MIN(CASE WHEN (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) > 0 THEN (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) END) as lowest_day
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) > 0 ${whereClause}
    `;
    
    // Get daily sales data (combined websites)
    const dailyQuery = `
      SELECT 
        date,
        (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) as sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) > 0 ${whereClause}
      ORDER BY date DESC
      LIMIT 90
    `;
    
    // Get monthly aggregated data (combined websites)
    const monthlyQuery = `
      SELECT 
        FORMAT_DATE('%Y-%m', date) as date,
        SUM(COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) as sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE (COALESCE(woocommerce_sales, 0) + COALESCE(shopify_sales, 0)) > 0 ${whereClause}
      GROUP BY date
      ORDER BY date DESC
      LIMIT 12
    `;
    
    // Get top products for WooCommerce from all sites with data
    const productsQuery = `
      WITH all_woo_products AS (
        SELECT product_name, 'BrickAnew' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'Heatilator' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'Superior' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'WaterWise' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
      )
      SELECT 
        product_name,
        'WooCommerce' as channel,
        SUM(total_revenue) as revenue,
        SUM(total_quantity_sold) as quantity,
        AVG(avg_unit_price) as avg_price,
        COUNT(DISTINCT site) as sites_available
      FROM all_woo_products
      GROUP BY product_name
      ORDER BY revenue DESC
      LIMIT 20
    `;
    
    // Get category data for WooCommerce - create basic categories from all sites with data
    const categoryQuery = `
      WITH all_woo_products AS (
        SELECT product_name, 'BrickAnew' as site, total_revenue, total_quantity_sold, order_date
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'Heatilator' as site, total_revenue, total_quantity_sold, order_date
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'Superior' as site, total_revenue, total_quantity_sold, order_date
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        
        UNION ALL
        
        SELECT product_name, 'WaterWise' as site, total_revenue, total_quantity_sold, order_date
        FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
      )
      SELECT 
        CASE 
          WHEN UPPER(product_name) LIKE '%FIREPLACE%' OR UPPER(product_name) LIKE '%DOOR%' THEN 'Fireplace Doors'
          WHEN UPPER(product_name) LIKE '%PAINT%' OR UPPER(product_name) LIKE '%ROLLER%' THEN 'Paint Products'
          WHEN UPPER(product_name) LIKE '%BELT%' OR UPPER(product_name) LIKE '%GRAB%' THEN 'Automotive'
          WHEN UPPER(product_name) LIKE '%HEATILATOR%' OR UPPER(product_name) LIKE '%SLIM%' THEN 'Heatilator Products'
          WHEN UPPER(product_name) LIKE '%WATER%' OR UPPER(product_name) LIKE '%FILTER%' OR UPPER(product_name) LIKE '%PURIFIER%' THEN 'Water Treatment'
          ELSE 'Other'
        END as name,
        'WooCommerce' as channel,
        SUM(total_revenue) as revenue,
        SUM(total_quantity_sold) as quantity,
        COUNT(DISTINCT product_name) as product_count,
        COUNT(DISTINCT site) as sites_available
      FROM all_woo_products
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