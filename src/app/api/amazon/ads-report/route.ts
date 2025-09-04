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
    const groupBy = searchParams.get('groupBy') || 'campaign'; // campaign, portfolio, adgroup
    const includeTimeSeries = searchParams.get('timeSeries') === 'true';
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
    }
    
    // Get time-series data if requested
    let timeSeriesData: Array<{
      date: string;
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
    }> = [];
    if (includeTimeSeries) {
      const timeSeriesQuery = `
        SELECT 
          date,
          SUM(amazon_ads_spend) as spend,
          SUM(amazon_ads_clicks) as clicks,
          SUM(amazon_ads_impressions) as impressions,
          SUM(amazon_ads_conversions) as conversions
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS\`
        WHERE 1=1 ${dateFilter.replace('date', 'date')}
        GROUP BY date
        ORDER BY date
      `;
      const [timeSeriesRows] = await bigquery.query(timeSeriesQuery);
      timeSeriesData = timeSeriesRows.map(row => ({
        date: row.date.value,
        spend: parseFloat(row.spend || 0),
        clicks: parseInt(row.clicks || 0),
        impressions: parseInt(row.impressions || 0),
        conversions: parseInt(row.conversions || 0)
      }));
    }
    
    // Main metrics query using enhanced keywords data
    const metricsQuery = `
      SELECT 
        ${groupBy === 'portfolio' 
          ? 'COALESCE(portfolio_name, "No Portfolio") as group_name, portfolio_name as group_id,'
          : groupBy === 'adgroup'
          ? 'ad_group_name as group_name, CAST(ad_group_id AS STRING) as group_id, campaign_name, portfolio_name,'
          : 'campaign_name as group_name, CAST(campaign_id AS STRING) as group_id, portfolio_name, campaign_status,'}
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        ROUND(SUM(cost), 2) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as unique_keywords,
        COUNT(DISTINCT CASE WHEN has_search_term THEN search_term END) as unique_search_terms,
        COUNT(DISTINCT date) as active_days,
        ${groupBy === 'campaign' ? 'COUNT(DISTINCT ad_group_id) as ad_groups_count,' : ''}
        
        -- Calculate metrics
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku) * 100.0, SUM(clicks)), 2) as sku_conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(impressions), NULLIF(COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END), 0)), 0) as avg_impressions_per_keyword,
        
        -- Performance quality indicators  
        ROUND(AVG(CASE WHEN has_performance THEN cpc END), 2) as weighted_cpc,
        ROUND(AVG(CASE WHEN has_performance THEN ctr END), 2) as weighted_ctr
      FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_performance = TRUE ${dateFilter}
      GROUP BY ${groupBy === 'portfolio' 
        ? 'portfolio_name'
        : groupBy === 'adgroup'
        ? 'ad_group_name, ad_group_id, campaign_name, portfolio_name'
        : 'campaign_name, campaign_id, portfolio_name, campaign_status'}
      ORDER BY total_cost DESC
    `;

    const [metricsRows] = await bigquery.query(metricsQuery);

    // Get top performing keywords from enhanced data
    const keywordsQuery = `
      SELECT 
        keyword_text as keyword,
        search_term,
        match_type,
        campaign_name as campaign,
        portfolio_name as portfolio,
        campaign_status,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        ROUND(SUM(cost), 2) as cost,
        SUM(conversions_1d_total) as conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        COUNT(DISTINCT date) as active_days,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku) * 100.0, SUM(clicks)), 2) as sku_conversion_rate,
        -- Quality flags
        MAX(CASE WHEN has_keyword_data THEN 1 ELSE 0 END) as has_keyword_data,
        MAX(CASE WHEN has_search_term THEN 1 ELSE 0 END) as has_search_term
      FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_keyword_data = TRUE AND has_performance = TRUE ${dateFilter}
      GROUP BY keyword_text, search_term, match_type, campaign_name, portfolio_name, campaign_status
      HAVING clicks > 0
      ORDER BY cost DESC
      LIMIT 25
    `;

    const [keywordsRows] = await bigquery.query(keywordsQuery);

    // Get portfolio summary from enhanced data
    const portfolioQuery = `
      SELECT 
        COALESCE(portfolio_name, 'No Portfolio') as portfolio,
        COUNT(DISTINCT campaign_id) as campaigns,
        COUNT(DISTINCT ad_group_id) as ad_groups,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as keywords,
        COUNT(DISTINCT date) as active_days,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        ROUND(SUM(cost), 2) as cost,
        SUM(conversions_1d_total) as conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku) * 100.0, SUM(clicks)), 2) as sku_conversion_rate
      FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_performance = TRUE ${dateFilter}
      GROUP BY portfolio_name
      ORDER BY cost DESC
    `;

    const [portfolioRows] = await bigquery.query(portfolioQuery);

    // Calculate overall summary from enhanced data
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT campaign_id) as total_campaigns,
        COUNT(DISTINCT CASE WHEN campaign_status = 'ENABLED' THEN campaign_id END) as active_campaigns,
        COUNT(DISTINCT ad_group_id) as total_ad_groups,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as total_keywords,
        COUNT(DISTINCT portfolio_name) as total_portfolios,
        COUNT(DISTINCT date) as active_days,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        ROUND(SUM(cost), 2) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as overall_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as overall_ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as overall_conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku) * 100.0, SUM(clicks)), 2) as overall_sku_conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(cost), NULLIF(COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END), 0)), 2) as avg_cost_per_keyword,
        -- Data quality metrics
        ROUND(AVG(CASE WHEN has_keyword_data THEN 100.0 ELSE 0 END), 1) as keyword_data_coverage,
        ROUND(AVG(CASE WHEN has_search_term THEN 100.0 ELSE 0 END), 1) as search_term_coverage
      FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_performance = TRUE ${dateFilter}
    `;

    const [summaryRows] = await bigquery.query(summaryQuery);

    // Get match type performance from enhanced data
    const matchTypeQuery = `
      SELECT 
        COALESCE(match_type, 'Not Specified') as match_type,
        COUNT(*) as keyword_count,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as unique_keywords,
        COUNT(DISTINCT date) as active_days,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        ROUND(SUM(cost), 2) as cost,
        SUM(conversions_1d_total) as conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku) * 100.0, SUM(clicks)), 2) as sku_conversion_rate
      FROM \`intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_performance = TRUE ${dateFilter}
      GROUP BY match_type
      ORDER BY cost DESC
    `;

    const [matchTypeRows] = await bigquery.query(matchTypeQuery);

    return cachedResponse({
      summary: summaryRows[0] || {},
      metrics: metricsRows,
      topKeywords: keywordsRows,
      portfolios: portfolioRows,
      matchTypePerformance: matchTypeRows,
      timeSeries: timeSeriesData,
      groupBy: groupBy,
      dateRange: startDate && endDate ? { startDate, endDate } : null
    }, CACHE_STRATEGIES.ANALYTICS);
  } catch (error) {
    return handleApiError(error);
  }
}