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
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
    }
    
    const query = `
      SELECT 
        campaign_name,
        ad_group_name,
        keyword_text,
        search_term,
        match_type,
        campaign_status,
        portfolio_name,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        ROUND(SUM(cost), 2) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        SUM(conversions_1d_sku) as sku_conversions,
        ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as cpc,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total), SUM(clicks)) * 100, 2) as conversion_rate,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_sku), SUM(clicks)) * 100, 2) as sku_conversion_rate,
        COUNT(DISTINCT date) as active_days,
        MIN(date) as first_active,
        MAX(date) as last_active,
        -- Quality indicators
        MAX(CASE WHEN has_keyword_data THEN 1 ELSE 0 END) as has_keyword,
        MAX(CASE WHEN has_search_term THEN 1 ELSE 0 END) as has_search_term
      FROM \`amazon_ads_sharepoint.keywords_enhanced\`
      WHERE has_performance = TRUE ${dateFilter}
      GROUP BY campaign_name, ad_group_name, keyword_text, search_term, match_type, campaign_status, portfolio_name
      ORDER BY total_cost DESC
      LIMIT 100
    `;
    
    const cacheKey = `amazon-ads-report-${startDate || 'all'}-${endDate || 'all'}`;

    return await cachedResponse(
      cacheKey,
      query,
      CACHE_STRATEGIES.ANALYTICS
    );

  } catch (error) {
    return handleApiError(error);
  }
}