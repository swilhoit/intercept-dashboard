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
    
    // Define category keywords for campaign classification
    const categoryKeywords = {
      'Paint': ['paint', 'brick-anew', 'brick anew', 'base coat', 'whitewash', 'stone fireplace paint', 'paint-kit', 'paint kit'],
      'Fireplace Doors': ['fireplace door', 'fp door', 'thermo-rite', 'glass door', 'fire screen', 'ez door'],
      'Mantels': ['mantel', 'shelf', 'shelves', 'log mantel'],
      'Other': []
    };
    
    // Build CASE statement for categorization
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
    
    // Mantels category
    const mantelConditions = categoryKeywords['Mantels'].map(keyword => 
      `LOWER(c.campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${mantelConditions} THEN 'Mantels' `;
    
    caseStatement += `ELSE 'Other' END`;
    
    // Query for campaign performance
    let campaignQuery = `
      WITH campaign_data AS (
        SELECT DISTINCT 
          campaign_id, 
          customer_id, 
          campaign_name,
          campaign_advertising_channel_type,
          campaign_advertising_channel_sub_type,
          campaign_bidding_strategy_type,
          campaign_status
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\`
        WHERE _DATA_DATE = _LATEST_DATE
      ),
      campaign_performance AS (
        SELECT 
          c.campaign_name,
          c.campaign_advertising_channel_type as channel_type,
          c.campaign_advertising_channel_sub_type as channel_subtype,
          c.campaign_bidding_strategy_type as bidding_strategy,
          c.campaign_status as status,
          ${caseStatement} as category,
          SUM(cs.metrics_cost_micros) / 1000000.0 as total_spend,
          SUM(cs.metrics_impressions) as total_impressions,
          SUM(cs.metrics_clicks) as total_clicks,
          SUM(cs.metrics_conversions) as total_conversions,
          SUM(cs.metrics_conversions_value) as conversions_value,
          COUNT(DISTINCT cs.segments_date) as active_days
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` cs
        JOIN campaign_data c
          ON cs.campaign_id = c.campaign_id 
          AND cs.customer_id = c.customer_id
        WHERE cs.segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      campaignQuery += ` AND cs.segments_date >= '${startDate}' AND cs.segments_date <= '${endDate}'`;
    }
    
    campaignQuery += `
        GROUP BY 
          c.campaign_name,
          c.campaign_advertising_channel_type,
          c.campaign_advertising_channel_sub_type,
          c.campaign_bidding_strategy_type,
          c.campaign_status,
          category
      )
      SELECT 
        *,
        CASE WHEN total_clicks > 0 THEN total_spend / total_clicks ELSE 0 END as cpc,
        CASE WHEN total_impressions > 0 THEN (total_clicks * 100.0) / total_impressions ELSE 0 END as ctr,
        CASE WHEN total_clicks > 0 THEN (total_conversions * 100.0) / total_clicks ELSE 0 END as conversion_rate,
        CASE WHEN total_spend > 0 THEN conversions_value / total_spend ELSE 0 END as roas
      FROM campaign_performance
      ORDER BY total_spend DESC
    `;
    
    console.log('Campaign Query:', campaignQuery);
    const [campaignRows] = await bigquery.query(campaignQuery);
    
    // Query for daily trend data
    let trendQuery = `
      WITH campaign_data AS (
        SELECT DISTINCT campaign_id, customer_id, campaign_name
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\`
        WHERE _DATA_DATE = _LATEST_DATE
      )
      SELECT 
        cs.segments_date as date,
        ${caseStatement} as category,
        SUM(cs.metrics_cost_micros) / 1000000.0 as daily_spend,
        SUM(cs.metrics_impressions) as daily_impressions,
        SUM(cs.metrics_clicks) as daily_clicks,
        SUM(cs.metrics_conversions) as daily_conversions
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` cs
      JOIN campaign_data c
        ON cs.campaign_id = c.campaign_id 
        AND cs.customer_id = c.customer_id
      WHERE cs.segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      trendQuery += ` AND cs.segments_date >= '${startDate}' AND cs.segments_date <= '${endDate}'`;
    }
    
    trendQuery += `
      GROUP BY cs.segments_date, category
      ORDER BY cs.segments_date ASC, category
    `;
    
    const [trendRows] = await bigquery.query(trendQuery);
    
    // Query for channel type breakdown
    let channelQuery = `
      WITH campaign_data AS (
        SELECT DISTINCT 
          campaign_id, 
          customer_id, 
          campaign_advertising_channel_type
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\`
        WHERE _DATA_DATE = _LATEST_DATE
      )
      SELECT 
        c.campaign_advertising_channel_type as channel,
        SUM(cs.metrics_cost_micros) / 1000000.0 as total_spend,
        SUM(cs.metrics_impressions) as total_impressions,
        SUM(cs.metrics_clicks) as total_clicks,
        SUM(cs.metrics_conversions) as total_conversions,
        COUNT(DISTINCT cs.campaign_id) as campaign_count
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` cs
      JOIN campaign_data c
        ON cs.campaign_id = c.campaign_id 
        AND cs.customer_id = c.customer_id
      WHERE cs.segments_date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      channelQuery += ` AND cs.segments_date >= '${startDate}' AND cs.segments_date <= '${endDate}'`;
    }
    
    channelQuery += `
      GROUP BY c.campaign_advertising_channel_type
      ORDER BY total_spend DESC
    `;
    
    const [channelRows] = await bigquery.query(channelQuery);
    
    // Process data for response
    const campaigns = campaignRows.map((row: any) => ({
      name: row.campaign_name,
      category: row.category,
      channelType: row.channel_type || 'Unknown',
      channelSubtype: row.channel_subtype || '',
      biddingStrategy: row.bidding_strategy || 'Unknown',
      status: row.status || 'Unknown',
      spend: row.total_spend || 0,
      impressions: row.total_impressions || 0,
      clicks: row.total_clicks || 0,
      conversions: row.total_conversions || 0,
      conversionsValue: row.conversions_value || 0,
      cpc: row.cpc || 0,
      ctr: row.ctr || 0,
      conversionRate: row.conversion_rate || 0,
      roas: row.roas || 0,
      activeDays: row.active_days || 0
    }));
    
    // Process trend data
    const trendData = trendRows.reduce((acc: any[], row: any) => {
      const existingDate = acc.find(item => item.date === row.date);
      if (existingDate) {
        existingDate[row.category] = {
          spend: row.daily_spend || 0,
          clicks: row.daily_clicks || 0,
          conversions: row.daily_conversions || 0
        };
      } else {
        acc.push({
          date: row.date,
          [row.category]: {
            spend: row.daily_spend || 0,
            clicks: row.daily_clicks || 0,
            conversions: row.daily_conversions || 0
          }
        });
      }
      return acc;
    }, []);
    
    // Process channel data
    const channels = channelRows.map((row: any) => ({
      name: row.channel || 'Unknown',
      spend: row.total_spend || 0,
      impressions: row.total_impressions || 0,
      clicks: row.total_clicks || 0,
      conversions: row.total_conversions || 0,
      campaignCount: row.campaign_count || 0,
      cpc: row.total_clicks > 0 ? row.total_spend / row.total_clicks : 0,
      ctr: row.total_impressions > 0 ? (row.total_clicks * 100.0) / row.total_impressions : 0,
      conversionRate: row.total_clicks > 0 ? (row.total_conversions * 100.0) / row.total_clicks : 0
    }));
    
    // Calculate category summary
    const categoryBreakdown = campaigns.reduce((acc: any, campaign: any) => {
      if (!acc[campaign.category]) {
        acc[campaign.category] = {
          name: campaign.category,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          conversionsValue: 0,
          campaignCount: 0
        };
      }
      acc[campaign.category].spend += campaign.spend;
      acc[campaign.category].impressions += campaign.impressions;
      acc[campaign.category].clicks += campaign.clicks;
      acc[campaign.category].conversions += campaign.conversions;
      acc[campaign.category].conversionsValue += campaign.conversionsValue;
      acc[campaign.category].campaignCount += 1;
      return acc;
    }, {});
    
    // Calculate metrics for category breakdown
    Object.values(categoryBreakdown).forEach((cat: any) => {
      cat.cpc = cat.clicks > 0 ? cat.spend / cat.clicks : 0;
      cat.ctr = cat.impressions > 0 ? (cat.clicks * 100.0) / cat.impressions : 0;
      cat.conversionRate = cat.clicks > 0 ? (cat.conversions * 100.0) / cat.clicks : 0;
      cat.roas = cat.spend > 0 ? cat.conversionsValue / cat.spend : 0;
    });
    
    return NextResponse.json({
      campaigns,
      trend: trendData,
      channels,
      categoryBreakdown: Object.values(categoryBreakdown),
      summary: {
        totalSpend: campaigns.reduce((sum: number, c: any) => sum + c.spend, 0),
        totalImpressions: campaigns.reduce((sum: number, c: any) => sum + c.impressions, 0),
        totalClicks: campaigns.reduce((sum: number, c: any) => sum + c.clicks, 0),
        totalConversions: campaigns.reduce((sum: number, c: any) => sum + c.conversions, 0),
        activeCampaigns: campaigns.filter((c: any) => c.status === 'ENABLED').length,
        totalCampaigns: campaigns.length
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}