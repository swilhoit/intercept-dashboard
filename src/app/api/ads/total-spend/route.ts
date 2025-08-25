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
    
    // Query for total Google Ads spend
    let query = `
      SELECT 
        SUM(metrics_cost_micros) / 1000000.0 as total_ad_spend,
        SUM(metrics_impressions) as total_impressions,
        SUM(metrics_clicks) as total_clicks,
        SUM(metrics_conversions) as total_conversions,
        SUM(metrics_conversions_value) as total_conversions_value,
        COUNT(DISTINCT campaign_id) as active_campaigns,
        MIN(segments_date) as start_date,
        MAX(segments_date) as end_date
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\`
      WHERE segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      query += ` AND segments_date >= '${startDate}' AND segments_date <= '${endDate}'`;
    }
    
    console.log('Total Ad Spend Query:', query);
    const [rows] = await bigquery.query(query);
    const result = rows[0] || {};
    
    // Calculate additional metrics
    const metrics = {
      totalAdSpend: result.total_ad_spend || 0,
      totalImpressions: result.total_impressions || 0,
      totalClicks: result.total_clicks || 0,
      totalConversions: result.total_conversions || 0,
      totalConversionsValue: result.total_conversions_value || 0,
      activeCampaigns: result.active_campaigns || 0,
      dateRange: {
        start: result.start_date,
        end: result.end_date
      },
      cpc: result.total_clicks > 0 ? (result.total_ad_spend / result.total_clicks) : 0,
      ctr: result.total_impressions > 0 ? (result.total_clicks * 100.0 / result.total_impressions) : 0,
      conversionRate: result.total_clicks > 0 ? (result.total_conversions * 100.0 / result.total_clicks) : 0,
      roas: result.total_ad_spend > 0 ? (result.total_conversions_value / result.total_ad_spend) : 0
    };
    
    // Get daily spend for trend
    let trendQuery = `
      SELECT 
        segments_date as date,
        SUM(metrics_cost_micros) / 1000000.0 as daily_spend,
        SUM(metrics_clicks) as daily_clicks,
        SUM(metrics_conversions) as daily_conversions
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\`
      WHERE segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      trendQuery += ` AND segments_date >= '${startDate}' AND segments_date <= '${endDate}'`;
    }
    
    trendQuery += `
      GROUP BY segments_date
      ORDER BY segments_date ASC
    `;
    
    const [trendRows] = await bigquery.query(trendQuery);
    
    return NextResponse.json({
      metrics,
      trend: trendRows
    });
  } catch (error) {
    return handleApiError(error);
  }
}