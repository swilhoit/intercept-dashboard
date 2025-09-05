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
    
    // Define category keywords matching the categories endpoint
    const categories = {
      'Paint': ['paint kit', 'paint can', 'gallon paint', 'quart paint', 'primer paint', 'base coat', 'top coat', 'sealant', 'stain', 'varnish', 'enamel paint', 'latex paint', 'acrylic paint'],
      'Fireplace Doors': ['ez door', 'glass door', 'fire screen', 'door steel', 'door plus', 'fireplace door', 'thermo-rite', 'fp door']
    };
    
    // Define exclusion keywords for paint accessories
    const paintAccessoryKeywords = ['roller', 'brush', 'tray', 'tape', 'drop cloth', 'scraper', 'putty knife', 'paint pad', 'extension pole', 'roller cover', 'roller frame'];
    
    // Build CASE statement for categorization with exclusions
    let caseStatement = 'CASE ';
    
    // Paint category with exclusions for accessories
    const paintConditions = categories['Paint'].map(keyword => 
      `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    const paintExclusions = paintAccessoryKeywords.map(keyword => 
      `LOWER(product_name) NOT LIKE '%${keyword.toLowerCase()}%'`
    ).join(' AND ');
    caseStatement += `WHEN (${paintConditions}) AND (${paintExclusions}) THEN 'Paint' `;
    
    // Fireplace Doors category
    const fireplaceConditions = categories['Fireplace Doors'].map(keyword => 
      `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${fireplaceConditions} THEN 'Fireplace Doors' `;
    
    caseStatement += `ELSE 'Other' END`;
    
    // Query for Amazon products with categories - combine both data sources
    let amazonQuery = `
      WITH combined_amazon AS (
        -- Recent data from amazon_seller table
        SELECT 
          Product_Name as product_name,
          Item_Price as revenue,
          1 as item_quantity,
          DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY) as order_date
        FROM \`intercept-sales-2508061117.amazon_seller.amazon_orders_2025\`
        WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0
        
        UNION ALL
        
        -- Historical data from amazon orders table  
        SELECT 
          product_name,
          revenue,
          item_quantity,
          DATE(date) as order_date
        FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
        WHERE product_name IS NOT NULL AND revenue IS NOT NULL AND revenue > 0
      )
      SELECT 
        product_name,
        ${caseStatement} as category,
        'Amazon' as channel,
        SUM(revenue) as total_sales,
        SUM(item_quantity) as quantity
      FROM combined_amazon
      WHERE product_name IS NOT NULL
    `;
    
    if (startDate && endDate) {
      amazonQuery += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }
    
    amazonQuery += `
      GROUP BY product_name, category
    `;
    
    // Query for WooCommerce products with categories
    let wooQuery = `
      SELECT 
        product_name,
        ${caseStatement} as category,
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
      GROUP BY product_name, category
    `;
    
    // Combine queries
    const finalQuery = `
      WITH all_products AS (
        ${amazonQuery}
        UNION ALL
        ${wooQuery}
      )
      SELECT * FROM all_products
      ORDER BY total_sales DESC
      LIMIT 100
    `;
    
    const [rows] = await bigquery.query(finalQuery);
    
    return NextResponse.json({ products: rows });
  } catch (error) {
    return handleApiError(error);
  }}