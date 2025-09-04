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
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND date BETWEEN '${startDate}' AND '${endDate}'`;
    }
    
    const query = `
      WITH combined_ads AS (
        -- Combine all Amazon ads tables with consistent schema
        SELECT 
          date,
          campaign_name,
          ad_group_name,
          keyword_text,
          search_term,
          match_type,
          clicks,
          impressions,
          cost,
          conversions_1d_total as conversions
        FROM \`amazon_ads_sharepoint.keywords\`
        WHERE clicks > 0 AND cost > 0 ${dateFilter}
        
        UNION ALL
        
        SELECT 
          date,
          campaign_name,
          ad_group_name,
          '' as keyword_text,
          '' as search_term,
          '' as match_type,
          clicks,
          impressions,
          cost,
          conversions_1d_total as conversions
        FROM \`amazon_ads_sharepoint.conversions_orders\`
        WHERE clicks > 0 AND cost > 0 ${dateFilter}
      )
      SELECT 
        campaign_name,
        ad_group_name,
        keyword_text,
        search_term,
        match_type,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        ROUND(SUM(cost), 2) as total_cost,
        SUM(conversions) as total_conversions,
        ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as cpc,
        ROUND(SAFE_DIVIDE(SUM(conversions), SUM(clicks)) * 100, 2) as conversion_rate
      FROM combined_ads
      GROUP BY campaign_name, ad_group_name, keyword_text, search_term, match_type
      ORDER BY total_cost DESC
      LIMIT 100
    `;

    const [rows] = await bigquery.query(query);
    
    return cachedResponse(rows, CACHE_STRATEGIES.ANALYTICS);
  } catch (error) {
    return handleApiError(error);
  }
}