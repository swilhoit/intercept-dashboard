import { NextRequest } from 'next/server';
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
      whereClause = `WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    } else {
      // Default to last 30 days if no date range provided
      whereClause = `WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    // A single, consolidated query
    const consolidatedQuery = `
      WITH daily_data AS (
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
          google_ads_impressions
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
        ${whereClause}
      ),
      summary AS (
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
        FROM daily_data
      )
      SELECT 
        (SELECT TO_JSON_STRING(s) FROM summary s) AS summary,
        (SELECT TO_JSON_STRING(ARRAY_AGG(d ORDER BY date ASC)) FROM daily_data d) AS daily
    `;

    // Use a unique cache key based on the date range
    const cacheKey = `ads-master-metrics-${startDate || 'default'}-${endDate || 'default'}`;

    const data = await cachedResponse(
      cacheKey,
      consolidatedQuery,
      CACHE_STRATEGIES.STANDARD
    ).then(res => res.json());

    const resultRow = data[0] || { summary: '{}', daily: '[]' };

    const summaryData = JSON.parse(resultRow.summary);
    const dailyData = JSON.parse(resultRow.daily);

    // Recreate the channel comparison from the summary data
    const channelComparison = [
      {
        channel: 'Amazon Ads',
        spend: summaryData.amazon_spend || 0,
        clicks: summaryData.amazon_clicks || 0,
        impressions: summaryData.amazon_impressions || 0,
        conversions: summaryData.amazon_conversions || 0,
        cpc: SAFE_DIVIDE(summaryData.amazon_spend, summaryData.amazon_clicks),
        ctr: SAFE_DIVIDE(summaryData.amazon_clicks * 100.0, summaryData.amazon_impressions),
        conversion_rate: SAFE_DIVIDE(summaryData.amazon_conversions * 100.0, summaryData.amazon_clicks)
      },
      {
        channel: 'Google Ads',
        spend: summaryData.google_spend || 0,
        clicks: summaryData.google_clicks || 0,
        impressions: summaryData.google_impressions || 0,
        conversions: 0,
        cpc: SAFE_DIVIDE(summaryData.google_spend, summaryData.google_clicks),
        ctr: SAFE_DIVIDE(summaryData.google_clicks * 100.0, summaryData.google_impressions),
        conversion_rate: 0
      }
    ];

    const finalResponse = {
      summary: summaryData,
      daily: dailyData,
      channels: channelComparison,
    };
    
    // We can't use our standard response wrapper here because we're returning the raw response
    // from cachedResponse which already includes the headers. But we need to return the transformed data.
    // So, we construct a new response with the final data, but we can't easily re-add cache headers here
    // without duplicating logic. This suggests a potential improvement for the cachedResponse helper later.
    return new Response(JSON.stringify(finalResponse), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleApiError(error);
  }
}

// Helper to avoid division by zero errors
const SAFE_DIVIDE = (numerator: number, denominator: number): number => {
  if (denominator === 0 || !denominator) return 0;
  return parseFloat((numerator / denominator).toFixed(2));
};