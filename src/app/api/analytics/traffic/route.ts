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
    
    // Define site configurations
    const sites = [
      { 
        name: 'Brick Anew',
        dataset: 'brick_anew_ga4',
        hasEventsummary: true
      },
      { 
        name: 'Heatilator',
        dataset: 'heatilator_ga4',
        hasEventsummary: false
      }
    ];
    
    // Get overall traffic metrics for each site
    const trafficQueries = sites.map(site => {
      let query = '';
      
      if (site.hasEventsummary) {
        // Use events_summary table for Brick Anew
        query = `
          SELECT 
            '${site.name}' as site_name,
            SUM(totalUsers) as total_users,
            SUM(newUsers) as new_users,
            SUM(sessions) as total_sessions,
            SUM(screenPageViews) as page_views,
            AVG(userEngagementDuration) as avg_engagement_duration,
            AVG(bounceRate) as avg_bounce_rate,
            SUM(conversions) as total_conversions,
            SUM(totalRevenue) as total_revenue
          FROM \`intercept-sales-2508061117.${site.dataset}.events_summary_2025\`
          WHERE date IS NOT NULL
        `;
      } else {
        // Use events_* tables for Heatilator
        query = `
          WITH daily_stats AS (
            SELECT 
              event_date,
              COUNT(DISTINCT user_pseudo_id) as users,
              COUNT(DISTINCT CASE WHEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_number') = 1 THEN user_pseudo_id END) as new_users,
              COUNT(DISTINCT CONCAT(user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id'))) as sessions,
              COUNTIF(event_name = 'page_view') as page_views,
              SUM(CASE WHEN event_name = 'user_engagement' THEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')/1000 ELSE 0 END) as engagement_duration
            FROM \`intercept-sales-2508061117.${site.dataset}.events_*\`
            WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
              AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
            GROUP BY event_date
          )
          SELECT 
            '${site.name}' as site_name,
            SUM(users) as total_users,
            SUM(new_users) as new_users,
            SUM(sessions) as total_sessions,
            SUM(page_views) as page_views,
            AVG(engagement_duration) as avg_engagement_duration,
            0 as avg_bounce_rate,
            0 as total_conversions,
            0 as total_revenue
          FROM daily_stats
        `;
      }
      
      if (startDate && endDate) {
        if (site.hasEventsummary) {
          query = query.replace('WHERE date IS NOT NULL', 
            `WHERE date >= '${startDate}' AND date <= '${endDate}'`);
        } else {
          query = query.replace(
            'WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE(\'%Y%m%d\', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))',
            `WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE('${startDate}'))`
          ).replace(
            'AND FORMAT_DATE(\'%Y%m%d\', CURRENT_DATE())',
            `AND FORMAT_DATE('%Y%m%d', DATE('${endDate}'))`
          );
        }
      }
      
      return query;
    });
    
    // Execute traffic queries
    const trafficResults = await Promise.all(
      trafficQueries.map(query => bigquery.query(query))
    );
    
    // Get channel breakdown for Brick Anew (has more detailed data)
    let channelQuery = `
      SELECT 
        sessionDefaultChannelGroup as channel,
        SUM(totalUsers) as users,
        SUM(sessions) as sessions,
        SUM(screenPageViews) as page_views,
        AVG(bounceRate) as bounce_rate,
        SUM(conversions) as conversions,
        SUM(totalRevenue) as revenue
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE sessionDefaultChannelGroup IS NOT NULL
    `;
    
    if (startDate && endDate) {
      channelQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    channelQuery += `
      GROUP BY sessionDefaultChannelGroup
      ORDER BY sessions DESC
    `;
    
    const [channelRows] = await bigquery.query(channelQuery);
    
    // Get device breakdown
    let deviceQuery = `
      SELECT 
        deviceCategory as device,
        SUM(totalUsers) as users,
        SUM(sessions) as sessions,
        SUM(screenPageViews) as page_views,
        AVG(bounceRate) as bounce_rate,
        AVG(userEngagementDuration) as avg_engagement_duration
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE deviceCategory IS NOT NULL
    `;
    
    if (startDate && endDate) {
      deviceQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    deviceQuery += `
      GROUP BY deviceCategory
      ORDER BY sessions DESC
    `;
    
    const [deviceRows] = await bigquery.query(deviceQuery);
    
    // Get top pages
    let pagesQuery = `
      SELECT 
        pagePath as page,
        pageTitle as title,
        SUM(screenPageViews) as views,
        SUM(totalUsers) as users,
        AVG(userEngagementDuration) as avg_time_on_page,
        AVG(bounceRate) as bounce_rate
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE pagePath IS NOT NULL AND eventName = 'page_view'
    `;
    
    if (startDate && endDate) {
      pagesQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    pagesQuery += `
      GROUP BY pagePath, pageTitle
      ORDER BY views DESC
      LIMIT 20
    `;
    
    const [pagesRows] = await bigquery.query(pagesQuery);
    
    // Get traffic sources
    let sourcesQuery = `
      SELECT 
        source,
        medium,
        SUM(totalUsers) as users,
        SUM(newUsers) as new_users,
        SUM(sessions) as sessions,
        SUM(screenPageViews) as page_views,
        AVG(bounceRate) as bounce_rate,
        SUM(conversions) as conversions
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE source IS NOT NULL
    `;
    
    if (startDate && endDate) {
      sourcesQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    sourcesQuery += `
      GROUP BY source, medium
      ORDER BY sessions DESC
      LIMIT 20
    `;
    
    const [sourcesRows] = await bigquery.query(sourcesQuery);
    
    // Get daily trend data
    let trendQuery = `
      SELECT 
        date,
        SUM(totalUsers) as users,
        SUM(sessions) as sessions,
        SUM(screenPageViews) as page_views,
        AVG(bounceRate) as bounce_rate,
        SUM(conversions) as conversions,
        SUM(totalRevenue) as revenue
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE date IS NOT NULL
    `;
    
    if (startDate && endDate) {
      trendQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    trendQuery += `
      GROUP BY date
      ORDER BY date ASC
    `;
    
    const [trendRows] = await bigquery.query(trendQuery);
    
    // Get geographic data
    let geoQuery = `
      SELECT 
        country,
        SUM(totalUsers) as users,
        SUM(sessions) as sessions,
        SUM(screenPageViews) as page_views,
        SUM(conversions) as conversions,
        SUM(totalRevenue) as revenue
      FROM \`intercept-sales-2508061117.brick_anew_ga4.events_summary_2025\`
      WHERE country IS NOT NULL AND country != '(not set)'
    `;
    
    if (startDate && endDate) {
      geoQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    geoQuery += `
      GROUP BY country
      ORDER BY sessions DESC
      LIMIT 10
    `;
    
    const [geoRows] = await bigquery.query(geoQuery);
    
    // Process results
    const siteMetrics = trafficResults.map((result, index) => {
      const [rows] = result;
      return {
        name: sites[index].name,
        ...(rows[0] || {
          total_users: 0,
          new_users: 0,
          total_sessions: 0,
          page_views: 0,
          avg_engagement_duration: 0,
          avg_bounce_rate: 0,
          total_conversions: 0,
          total_revenue: 0
        })
      };
    });
    
    // Calculate totals across all sites
    const totalMetrics = siteMetrics.reduce((acc, site) => ({
      total_users: acc.total_users + (site.total_users || 0),
      new_users: acc.new_users + (site.new_users || 0),
      total_sessions: acc.total_sessions + (site.total_sessions || 0),
      page_views: acc.page_views + (site.page_views || 0),
      total_conversions: acc.total_conversions + (site.total_conversions || 0),
      total_revenue: acc.total_revenue + (site.total_revenue || 0)
    }), {
      total_users: 0,
      new_users: 0,
      total_sessions: 0,
      page_views: 0,
      total_conversions: 0,
      total_revenue: 0
    });
    
    return NextResponse.json({
      summary: totalMetrics,
      sites: siteMetrics,
      channels: channelRows,
      devices: deviceRows,
      topPages: pagesRows,
      sources: sourcesRows,
      trend: trendRows,
      geography: geoRows
    });
  } catch (error) {
    return handleApiError(error);
  }
}