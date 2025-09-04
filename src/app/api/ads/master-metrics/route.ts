import { NextRequest } from 'next/server';
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
    
    let whereClause = 'WHERE 1=1';
    if (startDate && endDate) {
      whereClause += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    } else {
      // Default to last 30 days if no date range provided
      whereClause += ` AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    // Get aggregated metrics
    const metricsQuery = `
      SELECT 
        SUM(total_spend) as total_spend,
        SUM(total_clicks) as total_clicks,
        SUM(total_impressions) as total_impressions,
        SUM(total_conversions) as total_conversions,
        SUM(amazon_ads_spend) as amazon_spend,
        SUM(amazon_ads_clicks) as amazon_clicks,
        SUM(amazon_ads_impressions) as amazon_impressions,
        SUM(amazon_ads_conversions) as amazon_conversions,
        SUM(google_ads_spend) as google_spend,
        SUM(google_ads_clicks) as google_clicks,
        SUM(google_ads_impressions) as google_impressions,
        COUNT(DISTINCT date) as days_with_data,
        MIN(date) as start_date,
        MAX(date) as end_date,
        ROUND(SAFE_DIVIDE(SUM(total_spend), SUM(total_clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(total_clicks) * 100.0, SUM(total_impressions)), 2) as avg_ctr,
        ROUND(SAFE_DIVIDE(SUM(total_conversions) * 100.0, SUM(total_clicks)), 2) as avg_conversion_rate
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
      ${whereClause}
    `;

    const [metricsRows] = await bigquery.query(metricsQuery);
    
    // Get daily breakdown
    const dailyQuery = `
      SELECT 
        date,
        total_spend,
        total_clicks,
        total_impressions,
        total_conversions,
        amazon_ads_spend,
        amazon_ads_clicks,
        amazon_ads_impressions,
        amazon_ads_conversions,
        google_ads_spend,
        google_ads_clicks,
        google_ads_impressions,
        ROUND(SAFE_DIVIDE(total_spend, total_clicks), 2) as cpc,
        ROUND(SAFE_DIVIDE(total_clicks * 100.0, total_impressions), 2) as ctr,
        ROUND(SAFE_DIVIDE(total_conversions * 100.0, total_clicks), 2) as conversion_rate
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
      ${whereClause}
      ORDER BY date ASC
    `;

    const [dailyRows] = await bigquery.query(dailyQuery);
    
    // Get channel comparison
    const channelComparison = [
      {
        channel: 'Amazon Ads',
        spend: parseFloat(metricsRows[0]?.amazon_spend || 0),
        clicks: parseInt(metricsRows[0]?.amazon_clicks || 0),
        impressions: parseInt(metricsRows[0]?.amazon_impressions || 0),
        conversions: parseInt(metricsRows[0]?.amazon_conversions || 0),
        cpc: metricsRows[0]?.amazon_clicks > 0 
          ? parseFloat((metricsRows[0]?.amazon_spend / metricsRows[0]?.amazon_clicks).toFixed(2))
          : 0,
        ctr: metricsRows[0]?.amazon_impressions > 0
          ? parseFloat(((metricsRows[0]?.amazon_clicks * 100.0) / metricsRows[0]?.amazon_impressions).toFixed(2))
          : 0,
        conversion_rate: metricsRows[0]?.amazon_clicks > 0
          ? parseFloat(((metricsRows[0]?.amazon_conversions * 100.0) / metricsRows[0]?.amazon_clicks).toFixed(2))
          : 0
      },
      {
        channel: 'Google Ads',
        spend: parseFloat(metricsRows[0]?.google_spend || 0),
        clicks: parseInt(metricsRows[0]?.google_clicks || 0),
        impressions: parseInt(metricsRows[0]?.google_impressions || 0),
        conversions: 0, // Google Ads conversions not in current schema
        cpc: metricsRows[0]?.google_clicks > 0 
          ? parseFloat((metricsRows[0]?.google_spend / metricsRows[0]?.google_clicks).toFixed(2))
          : 0,
        ctr: metricsRows[0]?.google_impressions > 0
          ? parseFloat(((metricsRows[0]?.google_clicks * 100.0) / metricsRows[0]?.google_impressions).toFixed(2))
          : 0,
        conversion_rate: 0 // Google Ads conversions not in current schema
      }
    ];
    
    return cachedResponse({
      summary: metricsRows[0] || {},
      daily: dailyRows,
      channels: channelComparison
    }, CACHE_STRATEGIES.STANDARD);
  } catch (error) {
    return handleApiError(error);
  }
}