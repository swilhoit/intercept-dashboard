import { NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';

export async function GET() {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const query = `
      SELECT 
        Campaign_Name as campaign_name,
        Ad_Group_Name as ad_group_name,
        Keyword_Text as keyword_text,
        Customer_Search_Term as search_term,
        Match_Type as match_type,
        SUM(Clicks) as total_clicks,
        SUM(Impressions) as total_impressions,
        SUM(Cost) as total_cost,
        ROUND(SAFE_DIVIDE(SUM(Clicks), SUM(Impressions)) * 100, 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(Cost), SUM(Clicks)), 2) as cpc
      FROM \`amazon_ads.keywords\`
      WHERE Clicks > 0
        AND Cost > 0
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