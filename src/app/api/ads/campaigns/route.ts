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
      `LOWER(campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${paintConditions} THEN 'Paint' `;

    // Fireplace Doors category
    const fireplaceConditions = categoryKeywords['Fireplace Doors'].map(keyword =>
      `LOWER(campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${fireplaceConditions} THEN 'Fireplace Doors' `;

    // Mantels category
    const mantelConditions = categoryKeywords['Mantels'].map(keyword =>
      `LOWER(campaign_name) LIKE '%${keyword.toLowerCase()}%'`
    ).join(' OR ');
    caseStatement += `WHEN ${mantelConditions} THEN 'Mantels' `;

    caseStatement += `ELSE 'Other' END`;
    
    // Query for campaign performance using Google Ads data
    let campaignQuery = `
      WITH campaign_performance AS (
        SELECT
          c.campaign_name,
          c.campaign_bidding_strategy_type as bidding_strategy,
          c.campaign_status as status,
          ${caseStatement.replace(/campaign_name/g, 'c.campaign_name')} as category,
          SUM(s.metrics_cost_micros / 1000000) as total_spend,
          SUM(s.metrics_impressions) as total_impressions,
          SUM(s.metrics_clicks) as total_clicks,
          SUM(s.metrics_conversions) as total_conversions,
          SUM(s.metrics_conversions_value) as total_conversions_value,
          CASE WHEN SUM(s.metrics_clicks) > 0 THEN SUM(s.metrics_cost_micros / 1000000) / SUM(s.metrics_clicks) ELSE 0 END as cpc,
          CASE WHEN SUM(s.metrics_impressions) > 0 THEN (SUM(s.metrics_clicks) * 100.0) / SUM(s.metrics_impressions) ELSE 0 END as ctr,
          CASE WHEN SUM(s.metrics_clicks) > 0 THEN (SUM(s.metrics_conversions) * 100.0) / SUM(s.metrics_clicks) ELSE 0 END as conversion_rate,
          CASE WHEN SUM(s.metrics_cost_micros / 1000000) > 0 THEN SUM(s.metrics_conversions_value) / SUM(s.metrics_cost_micros / 1000000) ELSE 0 END as roas,
          COUNT(DISTINCT s.segments_date) as active_days
        FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` s
        JOIN \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\` c
          ON s.campaign_id = c.campaign_id
        WHERE c.campaign_name IS NOT NULL
          AND s.segments_date IS NOT NULL
    `;

    if (startDate && endDate) {
      campaignQuery += ` AND s.segments_date >= '${startDate}' AND s.segments_date <= '${endDate}'`;
    }

    campaignQuery += `
        GROUP BY
          c.campaign_name,
          c.campaign_bidding_strategy_type,
          c.campaign_status,
          category
      )
      SELECT *
      FROM campaign_performance
      ORDER BY total_spend DESC
    `;
    
    console.log('Campaign Query:', campaignQuery);
    const [campaignRows] = await bigquery.query(campaignQuery);
    
    // Query for daily trend data using Google Ads
    let trendQuery = `
      SELECT
        s.segments_date as date,
        ${caseStatement.replace(/campaign_name/g, 'c.campaign_name')} as category,
        SUM(s.metrics_cost_micros / 1000000) as daily_spend,
        SUM(s.metrics_impressions) as daily_impressions,
        SUM(s.metrics_clicks) as daily_clicks,
        SUM(s.metrics_conversions) as daily_conversions
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` s
      JOIN \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\` c
        ON s.campaign_id = c.campaign_id
      WHERE c.campaign_name IS NOT NULL
        AND s.segments_date IS NOT NULL
    `;

    if (startDate && endDate) {
      trendQuery += ` AND s.segments_date >= '${startDate}' AND s.segments_date <= '${endDate}'`;
    }

    trendQuery += `
      GROUP BY s.segments_date, category
      ORDER BY s.segments_date ASC, category
    `;
    
    const [trendRows] = await bigquery.query(trendQuery);
    
    // Query for network breakdown (Google Ads channel grouping)
    let channelQuery = `
      SELECT
        COALESCE(s.segments_ad_network_type, 'Unknown') as channel,
        SUM(s.metrics_cost_micros / 1000000) as total_spend,
        SUM(s.metrics_impressions) as total_impressions,
        SUM(s.metrics_clicks) as total_clicks,
        SUM(s.metrics_conversions) as total_conversions,
        COUNT(DISTINCT c.campaign_name) as campaign_count
      FROM \`intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789\` s
      JOIN \`intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789\` c
        ON s.campaign_id = c.campaign_id
      WHERE s.segments_date IS NOT NULL
    `;

    if (startDate && endDate) {
      channelQuery += ` AND s.segments_date >= '${startDate}' AND s.segments_date <= '${endDate}'`;
    }

    channelQuery += `
      GROUP BY s.segments_ad_network_type
      ORDER BY total_spend DESC
    `;
    
    const [channelRows] = await bigquery.query(channelQuery);
    
    // Process data for response
    const campaigns = campaignRows.map((row: any) => ({
      name: row.campaign_name,
      category: row.category,
      channelType: 'GOOGLE_ADS',
      channelSubtype: '',
      biddingStrategy: row.bidding_strategy || 'Unknown',
      status: row.status || 'Unknown',
      spend: parseFloat(row.total_spend) || 0,
      impressions: parseInt(row.total_impressions) || 0,
      clicks: parseInt(row.total_clicks) || 0,
      conversions: parseFloat(row.total_conversions) || 0,
      conversionsValue: parseFloat(row.total_conversions_value) || 0,
      cpc: parseFloat(row.cpc) || 0,
      ctr: parseFloat(row.ctr) || 0,
      conversionRate: parseFloat(row.conversion_rate) || 0,
      roas: parseFloat(row.roas) || 0,
      activeDays: parseInt(row.active_days) || 0
    }));
    
    // Process trend data
    const trendData = trendRows.reduce((acc: any[], row: any) => {
      const dateValue = row.date?.value || row.date;
      const existingDate = acc.find(item => item.date === dateValue);
      if (existingDate) {
        existingDate[row.category] = {
          spend: parseFloat(row.daily_spend) || 0,
          clicks: parseInt(row.daily_clicks) || 0,
          conversions: parseFloat(row.daily_conversions) || 0
        };
      } else {
        acc.push({
          date: dateValue,
          [row.category]: {
            spend: parseFloat(row.daily_spend) || 0,
            clicks: parseInt(row.daily_clicks) || 0,
            conversions: parseFloat(row.daily_conversions) || 0
          }
        });
      }
      return acc;
    }, []);

    // Process channel data (match types for Amazon Ads)
    const channels = channelRows.map((row: any) => {
      const spend = parseFloat(row.total_spend) || 0;
      const impressions = parseInt(row.total_impressions) || 0;
      const clicks = parseInt(row.total_clicks) || 0;
      const conversions = parseFloat(row.total_conversions) || 0;

      return {
        name: row.channel || 'Unknown',
        spend,
        impressions,
        clicks,
        conversions,
        campaignCount: parseInt(row.campaign_count) || 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        ctr: impressions > 0 ? (clicks * 100.0) / impressions : 0,
        conversionRate: clicks > 0 ? (conversions * 100.0) / clicks : 0
      };
    });
    
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
        totalConversionsValue: 0, // Not available in Amazon Ads keywords table
        activeCampaigns: campaigns.filter((c: any) => c.status === 'ENABLED' || c.status === 'enabled').length,
        totalCampaigns: campaigns.length
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}