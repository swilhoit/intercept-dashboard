import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const channel = searchParams.get('channel');
    const category = searchParams.get('category');
    const groupBy = searchParams.get('groupBy') || 'daily'; // daily, weekly, monthly
    
    // Build date formatting based on groupBy parameter for Amazon (uses date field)
    let amazonDateFormat = 'FORMAT_DATE("%Y-%m-%d", DATE(date))';
    let amazonDateField = 'DATE(date)';
    // For WooCommerce (uses order_date field)  
    let wooDateFormat = 'FORMAT_DATE("%Y-%m-%d", order_date)';
    let wooDateField = 'order_date';
    
    if (groupBy === 'weekly') {
      amazonDateFormat = 'FORMAT_DATE("%Y-W%U", DATE(date))';
      amazonDateField = 'DATE_TRUNC(DATE(date), WEEK)';
      wooDateFormat = 'FORMAT_DATE("%Y-W%U", order_date)';
      wooDateField = 'DATE_TRUNC(order_date, WEEK)';
    } else if (groupBy === 'monthly') {
      amazonDateFormat = 'FORMAT_DATE("%Y-%m", DATE(date))';
      amazonDateField = 'DATE_TRUNC(DATE(date), MONTH)';
      wooDateFormat = 'FORMAT_DATE("%Y-%m", order_date)';
      wooDateField = 'DATE_TRUNC(order_date, MONTH)';
    }
    
    // Build category filter if specified
    let categoryFilter = '';
    if (category && category !== 'all') {
      const categories: { [key: string]: string[] } = {
        'Paint': ['paint kit', 'paint can', 'gallon paint', 'quart paint', 'primer paint', 'base coat', 'top coat', 'sealant', 'stain', 'varnish', 'enamel paint', 'latex paint', 'acrylic paint'],
        'Fireplace Doors': ['ez door', 'glass door', 'fire screen', 'door steel', 'door plus']
      };
      
      const paintAccessoryKeywords = ['roller', 'brush', 'tray', 'tape', 'drop cloth', 'scraper', 'putty knife', 'paint pad', 'extension pole', 'roller cover', 'roller frame'];
      
      if (category === 'Other') {
        // Include paint accessories and exclude actual paint and fireplace products
        const allPaintKeywords = categories['Paint'];
        const allFireplaceKeywords = categories['Fireplace Doors'];
        
        // Exclude actual paint products (but allow accessories)
        const excludePaint = allPaintKeywords.map(keyword => 
          `LOWER(product_name) NOT LIKE '%${keyword.toLowerCase()}%'`
        ).join(' AND ');
        
        // Exclude fireplace products
        const excludeFireplace = allFireplaceKeywords.map(keyword => 
          `LOWER(product_name) NOT LIKE '%${keyword.toLowerCase()}%'`
        ).join(' AND ');
        
        // Include paint accessories OR other non-categorized products
        const includeAccessories = paintAccessoryKeywords.map(keyword => 
          `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
        ).join(' OR ');
        
        categoryFilter = ` AND ((${includeAccessories}) OR ((${excludePaint}) AND (${excludeFireplace})))`;
      } else if (category === 'Paint' && categories[category]) {
        // Paint category with exclusions for accessories
        const paintConditions = categories[category].map(keyword => 
          `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
        ).join(' OR ');
        const paintExclusions = paintAccessoryKeywords.map(keyword => 
          `LOWER(product_name) NOT LIKE '%${keyword.toLowerCase()}%'`
        ).join(' AND ');
        categoryFilter = ` AND ((${paintConditions}) AND (${paintExclusions}))`;
      } else if (categories[category]) {
        const conditions = categories[category].map(keyword => 
          `LOWER(product_name) LIKE '%${keyword.toLowerCase()}%'`
        ).join(' OR ');
        categoryFilter = ` AND (${conditions})`;
      }
    }
    
    let query = '';
    
    if (channel === 'Amazon' || !channel || channel === 'all') {
      query = `
        WITH amazon_breakdown AS (
          SELECT 
            ${amazonDateFormat} as period,
            MIN(${amazonDateField}) as period_date,
            product_name,
            asin as product_id,
            sku,
            'Amazon' as channel,
            SUM(revenue) as total_sales,
            SUM(item_quantity) as quantity,
            AVG(price) as avg_price,
            COUNT(*) as transaction_count
          FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
          WHERE product_name IS NOT NULL${categoryFilter}
      `;
      
      if (startDate && endDate) {
        query += ` AND DATE(date) >= '${startDate}' AND DATE(date) <= '${endDate}'`;
      }
      
      query += `
          GROUP BY period, product_name, asin, sku
        )
      `;
    }
    
    if (channel === 'WooCommerce' || !channel || channel === 'all') {
      const wooQuery = `
        ${query ? ',' : 'WITH'} woocommerce_breakdown AS (
          SELECT 
            ${wooDateFormat} as period,
            MIN(${wooDateField}) as period_date,
            product_name,
            CAST(product_id AS STRING) as product_id,
            CAST(product_id AS STRING) as sku,
            'WooCommerce' as channel,
            SUM(total_revenue) as total_sales,
            SUM(total_quantity_sold) as quantity,
            AVG(avg_unit_price) as avg_price,
            COUNT(*) as transaction_count
          FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
          WHERE product_name IS NOT NULL${categoryFilter}
      `;
      
      query += wooQuery;
      
      if (startDate && endDate) {
        query += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
      }
      
      query += `
          GROUP BY period, product_name, product_id
        )
      `;
    }
    
    // Combine results
    if (!channel || channel === 'all') {
      query += `
        SELECT * FROM (
          SELECT * FROM amazon_breakdown
          UNION ALL
          SELECT * FROM woocommerce_breakdown
        )
        ORDER BY period_date ASC, total_sales DESC
      `;
    } else if (channel === 'Amazon') {
      query += `
        SELECT * FROM amazon_breakdown
        ORDER BY period_date ASC, total_sales DESC
      `;
    } else if (channel === 'WooCommerce') {
      query += `
        SELECT * FROM woocommerce_breakdown
        ORDER BY period_date ASC, total_sales DESC
      `;
    }
    
    const [rows] = await bigquery.query(query);
    
    // Group by product for summary
    const productSummary = rows.reduce((acc: any, row: any) => {
      const key = `${row.product_id}_${row.channel}`;
      if (!acc[key]) {
        acc[key] = {
          product_name: row.product_name,
          product_id: row.product_id,
          sku: row.sku,
          channel: row.channel,
          total_revenue: 0,
          total_quantity: 0,
          periods: [],
          avg_price: 0,
          transaction_count: 0
        };
      }
      
      acc[key].total_revenue += row.total_sales || 0;
      acc[key].total_quantity += row.quantity || 0;
      acc[key].transaction_count += row.transaction_count || 0;
      acc[key].periods.push({
        period: row.period,
        sales: row.total_sales,
        quantity: row.quantity,
        avg_price: row.avg_price
      });
      
      return acc;
    }, {});
    
    const summary = Object.values(productSummary)
      .sort((a: any, b: any) => b.total_revenue - a.total_revenue)
      .slice(0, 50);
    
    return NextResponse.json({
      breakdown: rows,
      summary: summary,
      totalProducts: Object.keys(productSummary).length
    });
  } catch (error) {
    console.error('Error fetching product breakdown:', error);
    return NextResponse.json({ error: 'Failed to fetch product breakdown' }, { status: 500 });
  }
}