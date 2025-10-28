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
    
    // Get WooCommerce sales summary (excluding Shopify/WaterWise)
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
    
    // Get daily sales data (WooCommerce only)
    const dailyQuery = `
      SELECT 
        date,
        woocommerce_sales as sales
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      WHERE woocommerce_sales > 0 ${whereClause}
      ORDER BY date DESC
      LIMIT 90
    `;
    
    // Get monthly aggregated data (WooCommerce only)
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
        
        SELECT product_name, 'Majestic' as site, total_revenue, total_quantity_sold, avg_unit_price, order_date
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
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
        
        SELECT product_name, 'Majestic' as site, total_revenue, total_quantity_sold, order_date
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
      )
      SELECT 
        CASE 
          WHEN UPPER(product_name) LIKE '%FIREPLACE%' OR UPPER(product_name) LIKE '%DOOR%' THEN 'Fireplace Doors'
          WHEN UPPER(product_name) LIKE '%PAINT%' OR UPPER(product_name) LIKE '%ROLLER%' THEN 'Paint Products'
          WHEN UPPER(product_name) LIKE '%BELT%' OR UPPER(product_name) LIKE '%GRAB%' THEN 'Automotive'
          WHEN UPPER(product_name) LIKE '%HEATILATOR%' OR UPPER(product_name) LIKE '%SLIM%' THEN 'Heatilator Products'
          WHEN UPPER(product_name) LIKE '%SUPERIOR%' THEN 'Superior Products'
          WHEN UPPER(product_name) LIKE '%MAJESTIC%' OR UPPER(product_name) LIKE '%PREMIUM%' THEN 'Majestic Products'
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
    
    return cachedResponse({
      ...response,
      _timestamp: Date.now(),
      _debugInfo: {
        message: "WooCommerce sites cache fix applied",
        actualTotalRevenue: summaryRows[0]?.total_revenue || 0
      }
    }, {
      maxAge: 0,
      sMaxAge: 0,
      staleWhileRevalidate: 0
    });
  } catch (error) {
    return handleApiError(error);
  }
}