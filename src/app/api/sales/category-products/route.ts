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
      'Greywater': ['greywater', 'grey water', 'graywater', 'gray water', 'water treatment', 'water filter', 'water filtration', 'water purification', 'water recycling', 'water system', 'rainwater', 'rain water'],
      'Paint': ['paint kit', 'paint can', 'gallon paint', 'quart paint', 'primer paint', 'base coat', 'top coat', 'sealant', 'stain', 'varnish', 'enamel paint', 'latex paint', 'acrylic paint'],
      'Fireplace Doors': ['ez door', 'glass door', 'fire screen', 'door steel', 'door plus', 'fireplace door', 'thermo-rite', 'fp door']
    };
    
    // Define exclusion keywords for paint accessories
    const paintAccessoryKeywords = ['roller', 'brush', 'tray', 'tape', 'drop cloth', 'scraper', 'putty knife', 'paint pad', 'extension pole', 'roller cover', 'roller frame'];
    
    // Build CASE statement for categorization with exclusions
    let caseStatement = 'CASE ';

    // Greywater category (check first - most specific)
    const greywaterConditions = categories['Greywater'].map(keyword =>
      `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${greywaterConditions} THEN 'Greywater' `;

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

    // Build CASE statement for Amazon data with correct column name
    const amazonCaseStatement = caseStatement.replace(/product_name/g, 'Product_Name');

    // Query for Amazon products using both amazon tables with deduplication
    // amazon_seller is more current (Jan 1 2025 - Nov 13 2025)
    // orders_jan only for dates before 2025-01-01
    let amazonQuery = `
      WITH combined_amazon AS (
        -- Recent data from amazon_seller table (2025 onwards)
        SELECT
          Product_Name,
          Item_Price,
          CASE
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN DATE(Date)
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{5}$') THEN DATE_ADD(DATE '1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
            ELSE NULL
          END as order_date
        FROM \`intercept-sales-2508061117.amazon_seller.amazon_orders_2025\`
        WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0

        UNION ALL

        -- Historical data from amazon orders table (before 2025)
        SELECT
          product_name as Product_Name,
          revenue as Item_Price,
          DATE(date) as order_date
        FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
        WHERE product_name IS NOT NULL
          AND revenue IS NOT NULL
          AND revenue > 0
          AND DATE(date) < '2025-01-01'
      )
      SELECT
        Product_Name as product_name,
        ${amazonCaseStatement} as category,
        'Amazon' as channel,
        SUM(Item_Price) as total_sales,
        COUNT(*) as quantity
      FROM combined_amazon
      WHERE Product_Name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      GROUP BY Product_Name, category
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

    // Query for Shopify products with categories
    let shopifyQuery = `
      SELECT
        product_name,
        ${caseStatement} as category,
        'Shopify' as channel,
        SUM(total_revenue) as total_sales,
        SUM(total_quantity_sold) as quantity
      FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
      WHERE product_name IS NOT NULL
    `;

    if (startDate && endDate) {
      shopifyQuery += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }

    shopifyQuery += `
      GROUP BY product_name, category
    `;

    // Combine queries
    const finalQuery = `
      WITH all_products AS (
        ${amazonQuery}
        UNION ALL
        ${wooQuery}
        UNION ALL
        ${shopifyQuery}
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