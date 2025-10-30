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
    const groupBy = searchParams.get('groupBy') || 'campaign'; // campaign, portfolio, adgroup
    const includeTimeSeries = searchParams.get('timeSeries') === 'true';
    
    // Build date filter - default to last 30 days if no range specified
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `WHERE date BETWEEN '${startDate}' AND '${endDate}'`;
    } else {
      dateFilter = `WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    const consolidatedQuery = `
      WITH base_data AS (
        SELECT *
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
        ${dateFilter}
      ),
      summary AS (
        SELECT
          SUM(amazon_campaigns) as total_campaigns,
          SUM(amazon_campaigns) as active_campaigns,
          0 as total_ad_groups,
          0 as total_keywords,
          0 as total_portfolios,
          COUNT(DISTINCT date) as active_days,
          SUM(amazon_ads_clicks) as total_clicks,
          SUM(amazon_ads_impressions) as total_impressions,
          ROUND(SUM(amazon_ads_spend), 2) as total_cost,
          SUM(amazon_ads_conversions) as total_conversions,
          0 as sku_conversions,
          ROUND(SUM(amazon_ads_conversions) * 25.0, 2) as total_conversions_value,
          ROUND(SAFE_DIVIDE(SUM(amazon_ads_spend), SUM(amazon_ads_clicks)), 2) as overall_cpc,
          ROUND(SAFE_DIVIDE(SUM(amazon_ads_clicks) * 100.0, SUM(amazon_ads_impressions)), 2) as overall_ctr,
          ROUND(SAFE_DIVIDE(SUM(amazon_ads_conversions) * 100.0, SUM(amazon_ads_clicks)), 2) as overall_conversion_rate,
          100.0 as keyword_data_coverage,
          100.0 as search_term_coverage
        FROM base_data
      ),
      time_series AS (
        SELECT 
          date,
          SUM(amazon_ads_spend) as spend,
          SUM(amazon_ads_clicks) as clicks,
          SUM(amazon_ads_impressions) as impressions,
          SUM(amazon_ads_conversions) as conversions,
          ROUND(SUM(amazon_ads_conversions) * 25.0, 2) as conversions_value
        FROM base_data
        GROUP BY date
      )
      SELECT
        (SELECT TO_JSON_STRING(s) FROM summary s) AS summary,
        ${includeTimeSeries ? '(SELECT TO_JSON_STRING(ARRAY_AGG(t ORDER BY date)) FROM time_series t) AS timeSeries' : '"" AS timeSeries'}
    `;

    const cacheKey = `amazon-ads-report-${startDate || 'default'}-${endDate || 'default'}-${groupBy}-${includeTimeSeries}`;
    
    const data = await cachedResponse(
      cacheKey,
      consolidatedQuery,
      CACHE_STRATEGIES.ANALYTICS
    ).then(res => res.json());

    const resultRow = data[0] || { summary: '{}', timeSeries: '[]' };

    const response = {
      summary: JSON.parse(resultRow.summary),
      metrics: [], // Remainder of the arrays are empty as per original logic
      topKeywords: [],
      portfolios: [],
      matchTypePerformance: [],
      timeSeries: resultRow.timeSeries ? JSON.parse(resultRow.timeSeries) : [],
      groupBy: groupBy,
      dateRange: startDate && endDate ? { startDate, endDate } : null,
      _timestamp: Date.now()
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}