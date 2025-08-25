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
    const selectedSite = searchParams.get('site') || 'all';
    
    // Define site configurations - easily expandable for new sites
    const sites = [
      { 
        name: 'Brick Anew',
        dataset: 'brick_anew_ga4',
        hasEventsSummary: true,
        propertyId: 'brick_anew'
      },
      { 
        name: 'Heatilator',
        dataset: 'heatilator_ga4',
        hasEventsSummary: false,
        propertyId: 'heatilator'
      },
      {
        name: 'Analytics 291259221',
        dataset: 'analytics_291259221',
        hasEventsSummary: false,
        propertyId: 'analytics_291259221'
      },
      {
        name: 'Analytics 321103435',
        dataset: 'analytics_321103435',
        hasEventsSummary: false,
        propertyId: 'analytics_321103435'
      }
    ];
    
    // Filter sites based on selection
    const sitesToQuery = selectedSite === 'all' 
      ? sites 
      : sites.filter(s => s.propertyId === selectedSite);
    
    // Get traffic metrics for each selected site
    const trafficQueries = sitesToQuery.map(site => {
      let query = '';
      
      if (site.hasEventsSummary) {
        // Use events_summary table for sites that have it
        query = `
          SELECT 
            '${site.name}' as site_name,
            '${site.propertyId}' as site_id,
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
        // Use events_* tables for sites without summary
        query = `
          WITH daily_stats AS (
            SELECT 
              event_date,
              COUNT(DISTINCT user_pseudo_id) as users,
              COUNT(DISTINCT CASE WHEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_number') = 1 THEN user_pseudo_id END) as new_users,
              COUNT(DISTINCT CONCAT(user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id'))) as sessions,
              COUNTIF(event_name = 'page_view') as page_views,
              SUM(CASE WHEN event_name = 'user_engagement' THEN (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')/1000 ELSE 0 END) as engagement_duration,
              COUNTIF(event_name = 'purchase') as conversions,
              SUM(CASE WHEN event_name = 'purchase' THEN ecommerce.purchase_revenue ELSE 0 END) as revenue
            FROM \`intercept-sales-2508061117.${site.dataset}.events_*\`
            WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
              AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
            GROUP BY event_date
          )
          SELECT 
            '${site.name}' as site_name,
            '${site.propertyId}' as site_id,
            SUM(users) as total_users,
            SUM(new_users) as new_users,
            SUM(sessions) as total_sessions,
            SUM(page_views) as page_views,
            AVG(engagement_duration) as avg_engagement_duration,
            0 as avg_bounce_rate,
            SUM(conversions) as total_conversions,
            SUM(revenue) as total_revenue
          FROM daily_stats
        `;
      }
      
      if (startDate && endDate) {
        if (site.hasEventsSummary) {
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
      trafficQueries.map(query => bigquery.query(query).catch((err: any) => {
        console.error('Query failed:', err);
        return [[]]; // Return empty result on error
      }))
    );
    
    // Get daily trend data per site
    const trendQueries = sitesToQuery.map(site => {
      let query = '';
      
      if (site.hasEventsSummary) {
        query = `
          SELECT 
            date,
            '${site.propertyId}' as site_id,
            SUM(totalUsers) as users,
            SUM(sessions) as sessions,
            SUM(screenPageViews) as page_views,
            AVG(bounceRate) as bounce_rate,
            SUM(conversions) as conversions,
            SUM(totalRevenue) as revenue
          FROM \`intercept-sales-2508061117.${site.dataset}.events_summary_2025\`
          WHERE date IS NOT NULL
        `;
        
        if (startDate && endDate) {
          query += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
        }
        
        query += `
          GROUP BY date
          ORDER BY date ASC
        `;
      } else {
        query = `
          SELECT 
            PARSE_DATE('%Y%m%d', event_date) as date,
            '${site.propertyId}' as site_id,
            COUNT(DISTINCT user_pseudo_id) as users,
            COUNT(DISTINCT CONCAT(user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id'))) as sessions,
            COUNTIF(event_name = 'page_view') as page_views,
            0 as bounce_rate,
            COUNTIF(event_name = 'purchase') as conversions,
            SUM(CASE WHEN event_name = 'purchase' THEN ecommerce.purchase_revenue ELSE 0 END) as revenue
          FROM \`intercept-sales-2508061117.${site.dataset}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) 
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
        `;
        
        if (startDate && endDate) {
          query = query.replace(
            'WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE(\'%Y%m%d\', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))',
            `WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE('${startDate}'))`
          ).replace(
            'AND FORMAT_DATE(\'%Y%m%d\', CURRENT_DATE())',
            `AND FORMAT_DATE('%Y%m%d', DATE('${endDate}'))`
          );
        }
        
        query += `
          GROUP BY date
          ORDER BY date ASC
        `;
      }
      
      return query;
    });
    
    // Execute trend queries
    const trendResults = await Promise.all(
      trendQueries.map(query => bigquery.query(query).catch((err: any) => {
        console.error('Trend query failed:', err);
        return [[]];
      }))
    );
    
    // For channel, device, pages, sources - use first site with events_summary
    const primarySite = sites.find(s => s.hasEventsSummary) || sites[0];
    let channelRows = [], deviceRows = [], pagesRows = [], sourcesRows = [], geoRows = [];
    
    // Always try to get channel, device, pages data when we have a site with events_summary
    if (primarySite.hasEventsSummary) {
      // Get channel breakdown
      let channelQuery = `
        SELECT 
          sessionDefaultChannelGroup as channel,
          SUM(totalUsers) as users,
          SUM(sessions) as sessions,
          SUM(screenPageViews) as page_views,
          AVG(bounceRate) as bounce_rate,
          SUM(conversions) as conversions,
          SUM(totalRevenue) as revenue
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.events_summary_2025\`
        WHERE sessionDefaultChannelGroup IS NOT NULL
      `;
      
      if (startDate && endDate) {
        channelQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
      }
      
      channelQuery += `
        GROUP BY sessionDefaultChannelGroup
        ORDER BY sessions DESC
      `;
      
      [channelRows] = await bigquery.query(channelQuery).catch((err: any) => {
        console.error('Channel query failed:', err);
        return [[]];
      });
      
      // Get device breakdown
      let deviceQuery = `
        SELECT 
          deviceCategory as device,
          SUM(totalUsers) as users,
          SUM(sessions) as sessions,
          SUM(screenPageViews) as page_views,
          AVG(bounceRate) as bounce_rate,
          AVG(userEngagementDuration) as avg_engagement_duration
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.events_summary_2025\`
        WHERE deviceCategory IS NOT NULL
      `;
      
      if (startDate && endDate) {
        deviceQuery += ` AND date >= '${startDate}' AND date <= '${endDate}'`;
      }
      
      deviceQuery += `
        GROUP BY deviceCategory
        ORDER BY sessions DESC
      `;
      
      [deviceRows] = await bigquery.query(deviceQuery).catch((err: any) => {
        console.error('Device query failed:', err);
        return [[]];
      });
      
      // Get top pages
      let pagesQuery = `
        SELECT 
          pagePath as page,
          pageTitle as title,
          SUM(screenPageViews) as views,
          SUM(totalUsers) as users,
          AVG(userEngagementDuration) as avg_time_on_page,
          AVG(bounceRate) as bounce_rate
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.events_summary_2025\`
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
      
      [pagesRows] = await bigquery.query(pagesQuery).catch((err: any) => {
        console.error('Pages query failed:', err);
        return [[]];
      });
      
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
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.events_summary_2025\`
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
      
      [sourcesRows] = await bigquery.query(sourcesQuery).catch((err: any) => {
        console.error('Sources query failed:', err);
        return [[]];
      });
      
      // Get geographic data
      let geoQuery = `
        SELECT 
          country,
          SUM(totalUsers) as users,
          SUM(sessions) as sessions,
          SUM(screenPageViews) as page_views,
          SUM(conversions) as conversions,
          SUM(totalRevenue) as revenue
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.events_summary_2025\`
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
      
      [geoRows] = await bigquery.query(geoQuery).catch((err: any) => {
        console.error('Geography query failed:', err);
        return [[]];
      });
    }
    
    // Process results
    const siteMetrics = trafficResults.map((result, index) => {
      const [rows] = result;
      const site = sitesToQuery[index];
      return {
        name: site.name,
        id: site.propertyId,
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
    
    // Process trend data
    const allTrendData: any[] = [];
    trendResults.forEach((result, index) => {
      const [rows] = result;
      rows.forEach((row: any) => {
        allTrendData.push({
          ...row,
          site_name: sitesToQuery[index].name
        });
      });
    });
    
    // Aggregate trend data by date
    const aggregatedTrend = allTrendData.reduce((acc: any[], curr) => {
      const existingDate = acc.find(item => item.date === curr.date);
      if (existingDate) {
        existingDate.users = (existingDate.users || 0) + (curr.users || 0);
        existingDate.sessions = (existingDate.sessions || 0) + (curr.sessions || 0);
        existingDate.page_views = (existingDate.page_views || 0) + (curr.page_views || 0);
        existingDate.conversions = (existingDate.conversions || 0) + (curr.conversions || 0);
        existingDate.revenue = (existingDate.revenue || 0) + (curr.revenue || 0);
      } else {
        acc.push({
          date: curr.date,
          users: curr.users || 0,
          sessions: curr.sessions || 0,
          page_views: curr.page_views || 0,
          conversions: curr.conversions || 0,
          revenue: curr.revenue || 0
        });
      }
      return acc;
    }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
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
    
    const response = {
      summary: totalMetrics,
      sites: siteMetrics,
      siteTrends: allTrendData,
      aggregatedTrend,
      channels: channelRows,
      devices: deviceRows,
      topPages: pagesRows,
      sources: sourcesRows,
      geography: geoRows,
      availableSites: sites.map(s => ({ id: s.propertyId, name: s.name }))
    };
    
    console.log('Traffic Analytics Response:', {
      channelCount: channelRows.length,
      deviceCount: deviceRows.length,
      pagesCount: pagesRows.length,
      sourcesCount: sourcesRows.length,
      geoCount: geoRows.length,
      selectedSite,
      primarySite: primarySite?.name
    });
    
    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error);
  }
}