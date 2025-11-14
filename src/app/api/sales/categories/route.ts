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
    const aggregation = searchParams.get('aggregation') || 'daily';
    
    // Define category keywords - Check greywater first (most specific), then Paint, then Fireplace Doors
    const categories = {
      'Greywater': ['greywater', 'grey water', 'graywater', 'gray water', 'water treatment', 'water filter', 'water filtration', 'water purification', 'water recycling', 'water system', 'rainwater', 'rain water'],
      'Paint': ['paint kit', 'paint can', 'gallon paint', 'quart paint', 'primer paint', 'base coat', 'top coat', 'sealant', 'stain', 'varnish', 'enamel paint', 'latex paint', 'acrylic paint'],
      'Fireplace Doors': ['ez door', 'glass door', 'fire screen', 'door steel', 'door plus', 'fireplace door', 'thermo-rite', 'fp door']
    };
    
    // Define exclusion keywords for paint accessories
    const paintAccessoryKeywords = ['roller', 'brush', 'tray', 'tape', 'drop cloth', 'scraper', 'putty knife', 'paint pad', 'extension pole', 'roller cover', 'roller frame'];
    
    // Build date formatting based on aggregation  
    let dateFormat = '';
    let dateGroupBy = '';
    
    switch(aggregation) {
      case 'daily':
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", category_date)';
        dateGroupBy = 'category_date';
        break;
      case 'weekly':
        dateFormat = 'FORMAT_DATE("%Y-W%U", DATE_TRUNC(category_date, WEEK))';
        dateGroupBy = 'DATE_TRUNC(category_date, WEEK)';
        break;
      case 'monthly':
        dateFormat = 'FORMAT_DATE("%Y-%m", DATE_TRUNC(category_date, MONTH))';
        dateGroupBy = 'DATE_TRUNC(category_date, MONTH)';
        break;
      default:
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", category_date)';
        dateGroupBy = 'category_date';
    }
    
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

    // Query for Amazon data - Use aggregated amazon.daily_total_sales instead of raw orders
    let query = `
      WITH amazon_source AS (
        SELECT
          date as category_date,
          ordered_product_sales as sales,
          'Amazon' as channel
        FROM \`intercept-sales-2508061117.amazon.daily_total_sales\`
        WHERE date IS NOT NULL
    `;

    if (startDate && endDate) {
      query += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }

    query += `
      ),
      categorized_amazon AS (
        SELECT
          category_date,
          'Other' as category,
          'Amazon Orders' as product_name,
          'amazon_aggregate' as product_id,
          sales,
          1 as quantity,
          channel
        FROM amazon_source
      ),
      categorized_woocommerce AS (
        SELECT * FROM (
          SELECT
            order_date as category_date,
            ${caseStatement} as category,
            product_name,
            CAST(product_id AS STRING) as product_id,
            total_revenue as sales,
            total_quantity_sold as quantity,
            'WooCommerce' as channel
          FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
          WHERE product_name IS NOT NULL
          ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

          UNION ALL

          SELECT
            order_date as category_date,
            ${caseStatement} as category,
            product_name,
            CAST(product_id AS STRING) as product_id,
            total_revenue as sales,
            total_quantity_sold as quantity,
            'WooCommerce' as channel
          FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
          WHERE product_name IS NOT NULL
          ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

          UNION ALL

          SELECT
            order_date as category_date,
            ${caseStatement} as category,
            product_name,
            CAST(product_id AS STRING) as product_id,
            total_revenue as sales,
            total_quantity_sold as quantity,
            'WooCommerce' as channel
          FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
          WHERE product_name IS NOT NULL
          ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

          UNION ALL

          SELECT
            order_date as category_date,
            ${caseStatement} as category,
            product_name,
            CAST(product_id AS STRING) as product_id,
            total_revenue as sales,
            total_quantity_sold as quantity,
            'WooCommerce' as channel
          FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
          WHERE product_name IS NOT NULL
          ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

          UNION ALL

          SELECT
            order_date as category_date,
            ${caseStatement} as category,
            product_name,
            CAST(product_id AS STRING) as product_id,
            total_revenue as sales,
            total_quantity_sold as quantity,
            'WooCommerce' as channel
          FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
          WHERE product_name IS NOT NULL
          ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
        )
      ),
      categorized_shopify AS (
        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          product_name,
          CAST(product_id AS STRING) as product_id,
          total_revenue as sales,
          total_quantity_sold as quantity,
          'Shopify' as channel
        FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      all_categorized AS (
        SELECT * FROM categorized_amazon
        UNION ALL
        SELECT * FROM categorized_woocommerce
        UNION ALL
        SELECT * FROM categorized_shopify
      ),
      aggregated AS (
        SELECT 
          ${dateFormat} as period,
          ${dateGroupBy} as aggregation_date,
          category,
          SUM(sales) as total_sales,
          SUM(quantity) as total_quantity,
          COUNT(DISTINCT product_id) as unique_products,
          COUNT(*) as transaction_count,
          STRING_AGG(DISTINCT channel) as channels
        FROM all_categorized
        GROUP BY period, ${dateGroupBy}, category
      )
      SELECT * FROM aggregated
      ORDER BY aggregation_date ASC, category
    `;
    
    console.log('Categories Query - Date Range:', { startDate, endDate, aggregation });
    console.log('Executing main categories query...');

    let rows = [];
    try {
      [rows] = await bigquery.query(query);
      console.log('Main query returned', rows.length, 'rows');
    } catch (error) {
      console.error('Error in main categories query:', error);
      throw error;
    }
    
    // Get channel breakdown per category - Use aggregated amazon data
    const channelBreakdownQuery = `
      WITH amazon_breakdown AS (
        SELECT
          date,
          ordered_product_sales as sales
        FROM \`intercept-sales-2508061117.amazon.daily_total_sales\`
        WHERE date IS NOT NULL
        ${startDate && endDate ? `AND date >= '${startDate}' AND date <= '${endDate}'` : ''}
      ),
      categorized_amazon AS (
        SELECT
          'Other' as category,
          'Amazon' as channel,
          SUM(sales) as total_sales,
          COUNT(*) as total_quantity,
          COUNT(DISTINCT date) as unique_products
        FROM amazon_breakdown
        GROUP BY category
      ),
      all_woo_for_breakdown AS (
        SELECT
          ${caseStatement} as category,
          product_id,
          total_revenue,
          total_quantity_sold
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          product_id,
          total_revenue,
          total_quantity_sold
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          product_id,
          total_revenue,
          total_quantity_sold
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          product_id,
          total_revenue,
          total_quantity_sold
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          product_id,
          total_revenue,
          total_quantity_sold
        FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      categorized_woocommerce AS (
        SELECT
          category,
          'WooCommerce' as channel,
          SUM(total_revenue) as total_sales,
          SUM(total_quantity_sold) as total_quantity,
          COUNT(DISTINCT product_id) as unique_products
        FROM all_woo_for_breakdown
        GROUP BY category
      ),
      categorized_shopify AS (
        SELECT
          ${caseStatement} as category,
          'Shopify' as channel,
          SUM(total_revenue) as total_sales,
          SUM(total_quantity_sold) as total_quantity,
          COUNT(DISTINCT product_id) as unique_products
        FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
        GROUP BY category
      )
      SELECT * FROM (
        SELECT * FROM categorized_amazon
        UNION ALL
        SELECT * FROM categorized_woocommerce
        UNION ALL
        SELECT * FROM categorized_shopify
      )
      ORDER BY category, channel
    `;
    
    console.log('Executing channel breakdown query...');
    let channelRows = [];
    try {
      [channelRows] = await bigquery.query(channelBreakdownQuery);
      console.log('Channel breakdown query returned', channelRows.length, 'rows');
    } catch (error) {
      console.error('Error in channel breakdown query:', error);
      channelRows = [];
    }
    
    // Add channel time series query - Use aggregated amazon data
    const channelTimeSeriesQuery = `
      WITH amazon_ts AS (
        SELECT
          date as category_date,
          ordered_product_sales as sales
        FROM \`intercept-sales-2508061117.amazon.daily_total_sales\`
        WHERE date IS NOT NULL
        ${startDate && endDate ? `AND date >= '${startDate}' AND date <= '${endDate}'` : ''}
      ),
      categorized_amazon AS (
        SELECT
          category_date,
          'Other' as category,
          sales,
          'Amazon' as channel
        FROM amazon_ts
      ),
      all_woo_for_timeseries AS (
        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales
        FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      categorized_woocommerce AS (
        SELECT
          category_date,
          category,
          sales,
          'WooCommerce' as channel
        FROM all_woo_for_timeseries
      ),
      categorized_shopify AS (
        SELECT
          order_date as category_date,
          ${caseStatement} as category,
          total_revenue as sales,
          'Shopify' as channel
        FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      all_categorized AS (
        SELECT * FROM categorized_amazon
        UNION ALL
        SELECT * FROM categorized_woocommerce
        UNION ALL
        SELECT * FROM categorized_shopify
      )
      SELECT
        ${dateFormat} as period,
        category,
        channel,
        SUM(sales) as channel_sales
      FROM all_categorized
      GROUP BY period, category, channel
      ORDER BY period ASC, category, channel
    `;

    console.log('Executing channel time series query...');
    let channelTimeRows = [];
    try {
      [channelTimeRows] = await bigquery.query(channelTimeSeriesQuery);
      console.log('Channel time series query returned', channelTimeRows.length, 'rows');
    } catch (error) {
      console.error('Error in channel time series query:', error);
      channelTimeRows = [];
    }

    // Add unique products query - Amazon goes into "Other" category since it's aggregated
    const uniqueProductsQuery = `
      WITH amazon_unique AS (
        SELECT DISTINCT
          date,
          'amazon_aggregate' as product_id
        FROM \`intercept-sales-2508061117.amazon.daily_total_sales\`
        WHERE date IS NOT NULL
        ${startDate && endDate ? `AND date >= '${startDate}' AND date <= '${endDate}'` : ''}
      ),
      categorized_amazon AS (
        SELECT
          'Other' as category,
          product_id
        FROM amazon_unique
      ),
      all_woo_for_unique AS (
        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}

        UNION ALL

        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      categorized_woocommerce AS (
        SELECT category, product_id FROM all_woo_for_unique
      ),
      categorized_shopify AS (
        SELECT
          ${caseStatement} as category,
          CAST(product_id AS STRING) as product_id
        FROM \`intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean\`
        WHERE product_name IS NOT NULL
        ${startDate && endDate ? `AND order_date >= '${startDate}' AND order_date <= '${endDate}'` : ''}
      ),
      all_categorized AS (
        SELECT category, product_id FROM categorized_amazon
        UNION ALL
        SELECT category, product_id FROM categorized_woocommerce
        UNION ALL
        SELECT category, product_id FROM categorized_shopify
      )
      SELECT
        category,
        COUNT(DISTINCT product_id) as total_unique_products
      FROM all_categorized
      GROUP BY category
    `;

    console.log('Executing unique products query...');
    let uniqueRows = [];
    try {
      [uniqueRows] = await bigquery.query(uniqueProductsQuery);
      console.log('Unique products query returned', uniqueRows.length, 'rows');
    } catch (error) {
      console.error('Error in unique products query:', error);
      uniqueRows = [];
    }
    
    // Transform data for response
    const categoryData: any = {};
    const channelData: any = {};
    const dates = new Set<string>();
    
    // Process channel breakdown
    channelRows.forEach((row: any) => {
      const key = row.category;
      if (!channelData[key]) {
        channelData[key] = {
          amazon: 0,
          woocommerce: 0,
          shopify: 0,
          amazonQuantity: 0,
          woocommerceQuantity: 0,
          shopifyQuantity: 0,
          amazonProducts: 0,
          woocommerceProducts: 0,
          shopifyProducts: 0
        };
      }
      if (row.channel === 'Amazon') {
        channelData[key].amazon = row.total_sales || 0;
        channelData[key].amazonQuantity = row.total_quantity || 0;
        channelData[key].amazonProducts = row.unique_products || 0;
      } else if (row.channel === 'WooCommerce') {
        channelData[key].woocommerce = row.total_sales || 0;
        channelData[key].woocommerceQuantity = row.total_quantity || 0;
        channelData[key].woocommerceProducts = row.unique_products || 0;
      } else if (row.channel === 'Shopify') {
        channelData[key].shopify = row.total_sales || 0;
        channelData[key].shopifyQuantity = row.total_quantity || 0;
        channelData[key].shopifyProducts = row.unique_products || 0;
      }
    });
    
    // Process main aggregated data
    rows.forEach((row: any) => {
      const category = row.category;
      const period = row.period;
      dates.add(period);
      
      if (!categoryData[category]) {
        categoryData[category] = {
          name: category,
          data: [],
          totalSales: 0,
          totalQuantity: 0,
          transactionCount: 0,
          channelBreakdown: channelData[category] || {
            amazon: 0,
            woocommerce: 0,
            shopify: 0,
            amazonQuantity: 0,
            woocommerceQuantity: 0,
            shopifyQuantity: 0,
            amazonProducts: 0,
            woocommerceProducts: 0,
            shopifyProducts: 0
          }
        };
      }
      
      categoryData[category].data.push({
        date: period,
        sales: row.total_sales || 0,
        quantity: row.total_quantity || 0,
        products: row.unique_products || 0
      });
      
      categoryData[category].totalSales += row.total_sales || 0;
      categoryData[category].totalQuantity += row.total_quantity || 0;
      categoryData[category].transactionCount += row.transaction_count || 0;
    });

    // Add channel time series to data
    Object.keys(categoryData).forEach(category => {
      const dateToChannels = new Map<string, {amazon: number, woocommerce: number, shopify: number}>();

      channelTimeRows
        .filter((row: any) => row.category === category)
        .forEach((row: any) => {
          const { period, channel, channel_sales } = row;
          if (!dateToChannels.has(period)) {
            dateToChannels.set(period, { amazon: 0, woocommerce: 0, shopify: 0 });
          }
          const entry = dateToChannels.get(period)!;
          if (channel === 'Amazon') {
            entry.amazon = channel_sales || 0;
          } else if (channel === 'WooCommerce') {
            entry.woocommerce = channel_sales || 0;
          } else if (channel === 'Shopify') {
            entry.shopify = channel_sales || 0;
          }
        });

      categoryData[category].data.forEach((item: any) => {
        const channels = dateToChannels.get(item.date) || { amazon: 0, woocommerce: 0, shopify: 0 };
        item.amazon_sales = channels.amazon;
        item.woocommerce_sales = channels.woocommerce;
        item.shopify_sales = channels.shopify;
      });
    });

    // Set unique products from dedicated query
    Object.keys(categoryData).forEach(category => {
      const unique = uniqueRows.find((row: any) => row.category === category)?.total_unique_products || 0;
      categoryData[category].uniqueProducts = unique;
    });
    
    // Ensure all categories have data for all dates and channel breakdown
    const sortedDates = Array.from(dates).sort();
    Object.keys(categoryData).forEach(category => {
      const existingDates = new Set(categoryData[category].data.map((d: any) => d.date));
      sortedDates.forEach(date => {
        if (!existingDates.has(date)) {
          categoryData[category].data.push({
            date,
            sales: 0,
            quantity: 0,
            products: 0,
            amazon_sales: 0,
            woocommerce_sales: 0
          });
        }
      });
      categoryData[category].data.sort((a: any, b: any) => 
        a.date.localeCompare(b.date)
      );
      // Ensure channel breakdown exists
      if (!categoryData[category].channelBreakdown) {
        categoryData[category].channelBreakdown = channelData[category] || {
          amazon: 0,
          woocommerce: 0,
          shopify: 0,
          amazonQuantity: 0,
          woocommerceQuantity: 0,
          shopifyQuantity: 0,
          amazonProducts: 0,
          woocommerceProducts: 0,
          shopifyProducts: 0
        };
      }
    });
    
    // Calculate aggregated totals
    const aggregatedData = sortedDates.map(date => {
      const dayTotal = Object.values(categoryData).reduce((sum: number, cat: any) => {
        const dayData = cat.data.find((d: any) => d.date === date);
        return sum + (dayData?.sales || 0);
      }, 0);
      
      return {
        date,
        total: dayTotal,
        ...Object.fromEntries(
          Object.entries(categoryData).map(([key, cat]: [string, any]) => {
            const dayData = cat.data.find((d: any) => d.date === date);
            return [key, dayData?.sales || 0];
          })
        )
      };
    });
    
    const response = {
      categories: categoryData,
      aggregated: aggregatedData,
      dates: sortedDates,
      debug: {
        rowCount: rows.length,
        channelRowCount: channelRows.length,
        categoryCount: Object.keys(categoryData).length,
        dateRange: { startDate, endDate },
        aggregation
      }
    };

    console.log('Categories API Response:', {
      categoriesCount: Object.keys(categoryData).length,
      categories: Object.keys(categoryData),
      datesCount: sortedDates.length,
      firstDate: sortedDates[0],
      lastDate: sortedDates[sortedDates.length - 1]
    });

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}