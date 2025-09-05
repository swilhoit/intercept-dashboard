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
    
    // Define category keywords matching the sales categories
    const categoryKeywords = {
      'Paint': ['paint', 'brick-anew', 'brick anew', 'base coat', 'whitewash', 'stone fireplace paint', 'paint-kit', 'paint kit'],
      'Fireplace Doors': ['fireplace door', 'fp door', 'thermo-rite', 'glass door', 'fire screen', 'ez door']
    };
    
    // Build date formatting based on aggregation  
    let dateFormat = '';
    let dateGroupBy = '';
    
    switch(aggregation) {
      case 'daily':
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", segments_date)';
        dateGroupBy = 'segments_date';
        break;
      case 'weekly':
        dateFormat = 'FORMAT_DATE("%Y-W%U", DATE_TRUNC(segments_date, WEEK))';
        dateGroupBy = 'DATE_TRUNC(segments_date, WEEK)';
        break;
      case 'monthly':
        dateFormat = 'FORMAT_DATE("%Y-%m", DATE_TRUNC(segments_date, MONTH))';
        dateGroupBy = 'DATE_TRUNC(segments_date, MONTH)';
        break;
      default:
        dateFormat = 'FORMAT_DATE("%Y-%m-%d", segments_date)';
        dateGroupBy = 'segments_date';
    }
    
    // Build CASE statement for categorization based on campaign names
    let caseStatement = 'CASE ';
    
    // Paint category
    const paintConditions = categoryKeywords['Paint'].map(keyword => 
      `LOWER(c.campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${paintConditions} THEN 'Paint' `;
    
    // Fireplace Doors category
    const fireplaceConditions = categoryKeywords['Fireplace Doors'].map(keyword => 
      `LOWER(c.campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${fireplaceConditions} THEN 'Fireplace Doors' `;
    
    caseStatement += `ELSE 'Other' END`;
    
    // Query for Google Ads metrics
    let query = `
      WITH campaign_stats AS (
        SELECT 
          ${dateFormat} as period,
          ${dateGroupBy} as aggregation_date,
          c.campaign_name,
          ${caseStatement} as category,
          -- Convert cost from micros to dollars
          SUM(cs.metrics_cost_micros) / 1000000.0 as ad_spend,
          SUM(cs.metrics_impressions) as impressions,
          SUM(cs.metrics_clicks) as clicks,
          SUM(cs.metrics_conversions) as conversions,
          SUM(cs.metrics_conversions_value) as conversions_value
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` cs
        JOIN (
          SELECT DISTINCT campaign_id, customer_id, campaign_name 
          FROM \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\`
          WHERE _DATA_DATE = _LATEST_DATE
        ) c
          ON cs.campaign_id = c.campaign_id 
          AND cs.customer_id = c.customer_id
        WHERE cs.segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      query += ` AND cs.segments_date >= '${startDate}' AND cs.segments_date <= '${endDate}'`;
    }
    
    query += `
        GROUP BY period, ${dateGroupBy}, c.campaign_name, category
      ),
      aggregated_stats AS (
        SELECT 
          period,
          aggregation_date,
          category,
          SUM(ad_spend) as total_ad_spend,
          SUM(impressions) as total_impressions,
          SUM(clicks) as total_clicks,
          SUM(conversions) as total_conversions,
          SUM(conversions_value) as total_conversions_value,
          -- Calculate CPC (Cost Per Click)
          CASE 
            WHEN SUM(clicks) > 0 THEN SUM(ad_spend) / SUM(clicks)
            ELSE 0 
          END as cpc,
          -- Calculate CTR (Click-Through Rate)
          CASE 
            WHEN SUM(impressions) > 0 THEN (SUM(clicks) * 100.0) / SUM(impressions)
            ELSE 0 
          END as ctr,
          -- Calculate conversion rate
          CASE 
            WHEN SUM(clicks) > 0 THEN (SUM(conversions) * 100.0) / SUM(clicks)
            ELSE 0 
          END as conversion_rate,
          -- Calculate ROAS (Return on Ad Spend)
          CASE 
            WHEN SUM(ad_spend) > 0 THEN SUM(conversions_value) / SUM(ad_spend)
            ELSE 0 
          END as roas
        FROM campaign_stats
        GROUP BY period, aggregation_date, category
      )
      SELECT * FROM aggregated_stats
      ORDER BY aggregation_date ASC, category
    `;
    
    console.log('Google Ads Query:', query);
    const [rows] = await bigquery.query(query);
    
    // Get sales data to calculate TACOS - use same keywords as sales/categories route
    const salesCategories = {
      'Paint': ['paint kit', 'paint can', 'gallon paint', 'quart paint', 'primer paint', 'base coat', 'top coat', 'sealant', 'stain', 'varnish', 'enamel paint', 'latex paint', 'acrylic paint'],
      'Fireplace Doors': ['ez door', 'glass door', 'fire screen', 'door steel', 'door plus', 'fireplace door', 'thermo-rite', 'fp door']
    };
    
    let salesQuery = `
      WITH categorized_amazon AS (
        SELECT 
          ${dateFormat.replace('segments_date', 'DATE(date)')} as period,
          CASE 
            WHEN (${salesCategories['Paint'].map(k => `LOWER(product_name) LIKE '%${k}%'`).join(' OR ')}) THEN 'Paint'
            WHEN (${salesCategories['Fireplace Doors'].map(k => `LOWER(product_name) LIKE '%${k}%'`).join(' OR ')}) THEN 'Fireplace Doors'
            ELSE 'Other' 
          END as category,
          SUM(revenue) as sales
        FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
        WHERE product_name IS NOT NULL
    `;
    
    if (startDate && endDate) {
      salesQuery += ` AND DATE(date) >= '${startDate}' AND DATE(date) <= '${endDate}'`;
    }
    
    salesQuery += `
        GROUP BY period, category
      ),
      categorized_woocommerce AS (
        SELECT 
          ${dateFormat.replace('segments_date', 'order_date')} as period,
          CASE 
            WHEN (${salesCategories['Paint'].map(k => `LOWER(product_name) LIKE '%${k}%'`).join(' OR ')}) THEN 'Paint'
            WHEN (${salesCategories['Fireplace Doors'].map(k => `LOWER(product_name) LIKE '%${k}%'`).join(' OR ')}) THEN 'Fireplace Doors'
            ELSE 'Other' 
          END as category,
          SUM(total_revenue) as sales
        FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE product_name IS NOT NULL
    `;
    
    if (startDate && endDate) {
      salesQuery += ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }
    
    salesQuery += `
        GROUP BY period, category
      ),
      all_sales AS (
        SELECT period, category, SUM(sales) as total_sales
        FROM (
          SELECT * FROM categorized_amazon
          UNION ALL
          SELECT * FROM categorized_woocommerce
        )
        GROUP BY period, category
      )
      SELECT * FROM all_sales
      ORDER BY period, category
    `;
    
    const [salesRows] = await bigquery.query(salesQuery);
    
    // Combine ads data with sales data to calculate TACOS
    const salesMap = new Map();
    salesRows.forEach((row: any) => {
      const key = `${row.period}-${row.category}`;
      salesMap.set(key, row.total_sales || 0);
    });
    
    // Process and combine the data
    const categoryData: any = {};
    const dates = new Set<string>();
    
    rows.forEach((row: any) => {
      const category = row.category;
      const period = row.period;
      dates.add(period);
      
      if (!categoryData[category]) {
        categoryData[category] = {
          name: category,
          data: [],
          totalAdSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
          totalConversionsValue: 0,
          totalSales: 0,
          avgCPC: 0,
          avgCTR: 0,
          avgConversionRate: 0,
          avgROAS: 0,
          avgTACOS: 0
        };
      }
      
      const salesKey = `${period}-${category}`;
      const sales = salesMap.get(salesKey) || 0;
      const tacos = sales > 0 ? (row.total_ad_spend / sales) * 100 : 0;
      
      categoryData[category].data.push({
        date: period,
        adSpend: row.total_ad_spend || 0,
        impressions: row.total_impressions || 0,
        clicks: row.total_clicks || 0,
        conversions: row.total_conversions || 0,
        conversionsValue: row.total_conversions_value || 0,
        cpc: row.cpc || 0,
        ctr: row.ctr || 0,
        conversionRate: row.conversion_rate || 0,
        roas: row.roas || 0,
        sales: sales,
        tacos: tacos
      });
      
      categoryData[category].totalAdSpend += row.total_ad_spend || 0;
      categoryData[category].totalImpressions += row.total_impressions || 0;
      categoryData[category].totalClicks += row.total_clicks || 0;
      categoryData[category].totalConversions += row.total_conversions || 0;
      categoryData[category].totalConversionsValue += row.total_conversions_value || 0;
      categoryData[category].totalSales += sales;
    });
    
    // Calculate averages for each category
    Object.keys(categoryData).forEach(category => {
      const data = categoryData[category];
      if (data.totalClicks > 0) {
        data.avgCPC = data.totalAdSpend / data.totalClicks;
        data.avgConversionRate = (data.totalConversions / data.totalClicks) * 100;
      }
      if (data.totalImpressions > 0) {
        data.avgCTR = (data.totalClicks / data.totalImpressions) * 100;
      }
      if (data.totalAdSpend > 0) {
        data.avgROAS = data.totalConversionsValue / data.totalAdSpend;
      }
      if (data.totalSales > 0) {
        data.avgTACOS = (data.totalAdSpend / data.totalSales) * 100;
      }
    });
    
    // Ensure all categories have data for all dates
    const sortedDates = Array.from(dates).sort();
    Object.keys(categoryData).forEach(category => {
      const existingDates = new Set(categoryData[category].data.map((d: any) => d.date));
      sortedDates.forEach(date => {
        if (!existingDates.has(date)) {
          categoryData[category].data.push({
            date,
            adSpend: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            conversionsValue: 0,
            cpc: 0,
            ctr: 0,
            conversionRate: 0,
            roas: 0,
            sales: salesMap.get(`${date}-${category}`) || 0,
            tacos: 0
          });
        }
      });
      categoryData[category].data.sort((a: any, b: any) => 
        a.date.localeCompare(b.date)
      );
    });
    
    return NextResponse.json({
      categories: categoryData,
      dates: sortedDates
    });
  } catch (error) {
    return handleApiError(error);
  }
}