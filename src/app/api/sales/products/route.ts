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
      // Use both Amazon tables to get complete data coverage with deduplication
      let amazonQuery = `
        WITH combined_amazon AS (
          -- Combined data from both Amazon sources, avoiding overlap
          -- amazon_seller is more current (Jan 1 2025 - Nov 13 2025)
          -- orders_jan only for dates before 2025-01-01
          SELECT
            Product_Name as product_name,
            Item_Price as revenue,
            1 as item_quantity,
            CASE
              WHEN REGEXP_CONTAINS(Date, r'^[0-9]{5}$') THEN DATE_ADD(DATE '1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
              WHEN REGEXP_CONTAINS(Date, r'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN DATE(Date)
              ELSE PARSE_DATE('%m/%e/%y', Date)
            END as order_date,
            ASIN
          FROM \`intercept-sales-2508061117.amazon_seller.amazon_orders_2025\`
          WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0

          UNION ALL

          -- Historical data from amazon orders table (before 2025)
          SELECT
            product_name,
            revenue,
            item_quantity,
            DATE(date) as order_date,
            asin
          FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
          WHERE product_name IS NOT NULL
            AND revenue IS NOT NULL
            AND revenue > 0
            AND DATE(date) < '2025-01-01'
        )
        SELECT
          product_name,
          'Amazon' as channel,
          SUM(revenue) as total_sales,
          COUNT(*) as quantity
        FROM combined_amazon
        WHERE product_name IS NOT NULL
      `;
      
      if (startDate && endDate) {
        amazonQuery += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
      }
      
      amazonQuery += `
        GROUP BY product_name
      `;
      
      queries.push(amazonQuery);
    }
    
    if (!channel || channel === 'all' || channel === 'WooCommerce') {
      // Query all WooCommerce site tables to get complete product data
      let wooWhereClause = '';
      if (startDate && endDate) {
        wooWhereClause = ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
      }

      // Create individual queries for each WooCommerce site and combine them
      const wooSites = ['heatilator', 'superior', 'waterwise', 'brickanew', 'majestic'];
      const wooQueries = wooSites.map(site => `
        SELECT 
          product_name,
          'WooCommerce' as channel,
          SUM(total_revenue) as total_sales,
          SUM(total_quantity_sold) as quantity
        FROM \`intercept-sales-2508061117.woocommerce.${site}_daily_product_sales\`
        WHERE product_name IS NOT NULL ${wooWhereClause}
        GROUP BY product_name
      `);

      // Combine all WooCommerce queries
      const combinedWooQuery = `
        SELECT 
          product_name,
          channel,
          SUM(total_sales) as total_sales,
          SUM(quantity) as quantity
        FROM (
          ${wooQueries.join(' UNION ALL ')}
        )
        GROUP BY product_name, channel
      `;
      
      queries.push(combinedWooQuery);
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