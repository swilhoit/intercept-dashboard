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
    const groupBy = searchParams.get('groupBy') || 'campaign';
    const includeTimeSeries = searchParams.get('timeSeries') === 'true';

    // Build date filter - default to last 30 days if no range specified
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `WHERE date BETWEEN '${startDate}' AND '${endDate}'`;
    } else {
      dateFilter = `WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }

    // Build detailed data query from conversions_orders table
    let detailedDateFilter = dateFilter.replace('date', 'date');

    const consolidatedQuery = `
      WITH base_data AS (
        SELECT *
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
        ${dateFilter}
      ),
      summary_campaigns AS (
        SELECT
          COUNT(DISTINCT campaign_name) as total_campaigns,
          COUNT(DISTINCT CASE WHEN campaign_status = 'ENABLED' THEN campaign_name END) as active_campaigns,
          COUNT(DISTINCT portfolio_name) as total_portfolios
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders\`
        ${detailedDateFilter}
      ),
      summary_keywords AS (
        SELECT
          COALESCE(COUNT(DISTINCT ad_group_name), 0) as total_ad_groups,
          COALESCE(COUNT(DISTINCT keyword_text), 0) as total_keywords
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
        ${detailedDateFilter}
        AND LENGTH(COALESCE(keyword_text, '')) > 0
      ),
      summary AS (
        SELECT
          (SELECT total_campaigns FROM summary_campaigns) as total_campaigns,
          (SELECT active_campaigns FROM summary_campaigns) as active_campaigns,
          (SELECT total_ad_groups FROM summary_keywords) as total_ad_groups,
          (SELECT total_keywords FROM summary_keywords) as total_keywords,
          (SELECT total_portfolios FROM summary_campaigns) as total_portfolios,
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
      metrics AS (
        SELECT
          ${groupBy === 'campaign' ? 'campaign_name' : groupBy === 'portfolio' ? 'portfolio_name' : 'ad_group_name'} as group_name,
          ${groupBy === 'campaign' ? 'portfolio_name, campaign_status,' : ''}
          ${groupBy === 'adgroup' ? 'campaign_name,' : ''}
          SUM(cost) as total_cost,
          SUM(clicks) as total_clicks,
          SUM(impressions) as total_impressions,
          SUM(conversions_1d_total) as total_conversions,
          ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
          ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
          ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
          COUNT(DISTINCT ${groupBy === 'campaign' ? 'ad_group_name' : 'campaign_name'}) as ${groupBy === 'campaign' ? 'ad_groups_count' : 'campaigns_count'}
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders\`
        ${detailedDateFilter}
        GROUP BY ${groupBy === 'campaign' ? 'campaign_name, portfolio_name, campaign_status' : groupBy === 'portfolio' ? 'portfolio_name' : 'ad_group_name, campaign_name'}
        ORDER BY total_cost DESC
        LIMIT 50
      ),
      portfolio_keywords AS (
        SELECT
          COALESCE(portfolio_name, 'No Portfolio') as portfolio,
          COUNT(DISTINCT keyword_text) as keyword_count
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
        ${detailedDateFilter}
        AND LENGTH(COALESCE(keyword_text, '')) > 0
        GROUP BY portfolio_name
      ),
      portfolios AS (
        SELECT
          COALESCE(c.portfolio_name, 'No Portfolio') as portfolio,
          SUM(c.cost) as cost,
          SUM(c.clicks) as clicks,
          SUM(c.impressions) as impressions,
          SUM(c.conversions_1d_total) as conversions,
          ROUND(SAFE_DIVIDE(SUM(c.cost), SUM(c.clicks)), 2) as avg_cpc,
          ROUND(SAFE_DIVIDE(SUM(c.clicks) * 100.0, SUM(c.impressions)), 2) as ctr,
          ROUND(SAFE_DIVIDE(SUM(c.conversions_1d_total) * 100.0, SUM(c.clicks)), 2) as conversion_rate,
          COUNT(DISTINCT c.campaign_name) as campaigns,
          COUNT(DISTINCT c.ad_group_name) as ad_groups,
          MAX(COALESCE(k.keyword_count, 0)) as keywords
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders\` c
        LEFT JOIN portfolio_keywords k ON COALESCE(c.portfolio_name, 'No Portfolio') = k.portfolio
        ${detailedDateFilter.replace('date', 'c.date')}
        GROUP BY c.portfolio_name
        ORDER BY cost DESC
      ),
      top_keywords AS (
        SELECT
          campaign_name as campaign,
          keyword_text as keyword,
          search_term,
          match_type,
          SUM(clicks) as clicks,
          SUM(cost) as cost,
          ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as cpc,
          ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
        ${detailedDateFilter}
        AND LENGTH(COALESCE(keyword_text, '')) > 0
        GROUP BY campaign_name, keyword_text, search_term, match_type
        ORDER BY clicks DESC
        LIMIT 20
      ),
      match_type_perf AS (
        SELECT
          COALESCE(match_type, 'Unknown') as match_type,
          SUM(cost) as cost,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions,
          ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
          ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate
        FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
        ${detailedDateFilter}
        AND LENGTH(COALESCE(match_type, '')) > 0
        GROUP BY match_type
        ORDER BY cost DESC
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
        (SELECT TO_JSON_STRING(ARRAY_AGG(m ORDER BY total_cost DESC)) FROM metrics m) AS metrics,
        (SELECT TO_JSON_STRING(ARRAY_AGG(p ORDER BY cost DESC)) FROM portfolios p) AS portfolios,
        (SELECT TO_JSON_STRING(COALESCE(ARRAY_AGG(tk ORDER BY clicks DESC), [])) FROM top_keywords tk) AS topKeywords,
        (SELECT TO_JSON_STRING(COALESCE(ARRAY_AGG(mt ORDER BY cost DESC), [])) FROM match_type_perf mt) AS matchTypePerformance,
        ${includeTimeSeries ? '(SELECT TO_JSON_STRING(ARRAY_AGG(t ORDER BY date)) FROM time_series t) AS timeSeries' : '"[]" AS timeSeries'}
    `;

    const cacheKey = `amazon-ads-report-${startDate || 'default'}-${endDate || 'default'}-${groupBy}-${includeTimeSeries}`;

    const data = await cachedResponse(
      cacheKey,
      consolidatedQuery,
      CACHE_STRATEGIES.ANALYTICS
    ).then(res => res.json());

    const resultRow = data[0] || {
      summary: '{}',
      metrics: '[]',
      portfolios: '[]',
      topKeywords: '[]',
      matchTypePerformance: '[]',
      timeSeries: '[]'
    };

    const response = {
      summary: JSON.parse(resultRow.summary),
      metrics: JSON.parse(resultRow.metrics || '[]'),
      topKeywords: JSON.parse(resultRow.topKeywords || '[]'),
      portfolios: JSON.parse(resultRow.portfolios || '[]'),
      matchTypePerformance: JSON.parse(resultRow.matchTypePerformance || '[]'),
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
