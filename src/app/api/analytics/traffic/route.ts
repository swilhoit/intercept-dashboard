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
    
    console.log('Traffic Analytics API - Date Range:', { startDate, endDate, selectedSite });
    // Note: Using attribution tables with full GA4 data from January 1, 2025 onwards
    
    // Define site configurations - only the 2 main sites
    const sites = [
      { 
        name: 'Brick Anew',
        dataset: 'brick_anew_ga4',
        hasAttribution: true, // Use attribution tables with full year data
        propertyId: 'brick_anew'
      },
      { 
        name: 'Heatilator',
        dataset: 'heatilator_ga4',
        hasAttribution: true, // Use attribution tables with full year data
        propertyId: 'heatilator'
      }
    ];
    
    // Filter sites based on selection
    const sitesToQuery = selectedSite === 'all' 
      ? sites 
      : sites.filter(s => s.propertyId === selectedSite);
    
    // Get traffic metrics for each selected site
    const trafficQueries = sitesToQuery.map(site => {
      let query = '';
      
      if (site.hasAttribution) {
        // Use attribution tables with full year data (Jan 1 - Aug 25, 2025)
        query = `
          SELECT 
            '${site.name}' as site_name,
            '${site.propertyId}' as site_id,
            SUM(totalUsers) as total_users,
            SUM(newUsers) as new_users,
            SUM(sessions) as total_sessions,
            SUM(sessions) * 2.5 as page_views, -- Estimated based on typical pages/session
            0 as avg_engagement_duration,
            0 as avg_bounce_rate,
            SUM(ecommercePurchases) as total_conversions,
            SUM(purchaseRevenue) as total_revenue
          FROM \`intercept-sales-2508061117.${site.dataset}.attribution_channel_performance\`
          WHERE date >= '2025-01-01'
        `;
      } else {
        // Fallback to events tables (limited to Aug 14+)
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
            WHERE _TABLE_SUFFIX BETWEEN '20250814' 
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
        if (site.hasAttribution) {
          query = query.replace("WHERE date >= '2025-01-01'", 
            `WHERE date >= '${startDate}' AND date <= '${endDate}'`);
        } else {
          query = query.replace(
            "WHERE _TABLE_SUFFIX BETWEEN '20250814'",
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
      
      if (site.hasAttribution) {
        // Use attribution tables for full year trends
        query = `
          SELECT 
            date,
            '${site.propertyId}' as site_id,
            SUM(totalUsers) as users,
            SUM(sessions) as sessions,
            SUM(sessions) * 2.5 as page_views,
            0 as bounce_rate,
            SUM(ecommercePurchases) as conversions,
            SUM(purchaseRevenue) as revenue
          FROM \`intercept-sales-2508061117.${site.dataset}.attribution_channel_performance\`
          WHERE date >= '2025-01-01'
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
          WHERE _TABLE_SUFFIX BETWEEN '20250814' 
            AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
        `;
        
        if (startDate && endDate) {
          query = query.replace(
            "WHERE _TABLE_SUFFIX BETWEEN '20250814'",
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
    
    // For channel, device, pages, sources - use first site with attribution data
    const primarySite = sites.find(s => s.hasAttribution) || sites[0];
    let channelRows: any[] = [], deviceRows: any[] = [], pagesRows: any[] = [], sourcesRows: any[] = [], geoRows: any[] = [];
    
    // Use attribution tables for channel, device, source breakdowns
    if (primarySite && primarySite.hasAttribution) {
      // Get channel breakdown from attribution tables
      let channelQuery = `
        SELECT 
          sessionDefaultChannelGrouping as channel,
          SUM(totalUsers) as users,
          SUM(sessions) as sessions,
          SUM(sessions) * 2.5 as page_views,
          0 as bounce_rate,
          SUM(ecommercePurchases) as conversions,
          SUM(purchaseRevenue) as revenue
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.attribution_channel_performance\`
        WHERE date >= '2025-01-01'
          AND sessionDefaultChannelGrouping IS NOT NULL
      `;
      
      if (startDate && endDate) {
        channelQuery = channelQuery.replace(
          "WHERE date >= '2025-01-01'",
          `WHERE date >= '${startDate}' AND date <= '${endDate}'`
        );
      }
      
      channelQuery += `
        GROUP BY sessionDefaultChannelGrouping
        ORDER BY sessions DESC
        LIMIT 10
      `;
      
      [channelRows] = await bigquery.query(channelQuery).catch((err: any) => {
        console.error('Channel query failed:', err);
        return [[]];
      });
      
      // Get device breakdown from attribution tables
      let deviceQuery = `
        SELECT 
          deviceCategory as device,
          SUM(totalUsers) as users,
          SUM(sessions) as sessions,
          SUM(sessions) * 2.5 as page_views,
          0 as bounce_rate,
          0 as avg_engagement_duration
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.attribution_channel_performance\`
        WHERE date >= '2025-01-01'
          AND deviceCategory IS NOT NULL
      `;
      
      if (startDate && endDate) {
        deviceQuery = deviceQuery.replace(
          "WHERE date >= '2025-01-01'",
          `WHERE date >= '${startDate}' AND date <= '${endDate}'`
        );
      }
      
      deviceQuery += `
        GROUP BY deviceCategory
        ORDER BY sessions DESC
      `;
      
      [deviceRows] = await bigquery.query(deviceQuery).catch((err: any) => {
        console.error('Device query failed:', err);
        return [[]];
      });
      
      // Skip top pages for now - not in attribution tables
      pagesRows = [];
      
      // Get traffic sources from attribution tables
      let sourcesQuery = `
        SELECT 
          sessionSource as source,
          sessionMedium as medium,
          SUM(totalUsers) as users,
          SUM(newUsers) as new_users,
          SUM(sessions) as sessions,
          SUM(sessions) * 2.5 as page_views,
          0 as bounce_rate,
          SUM(ecommercePurchases) as conversions
        FROM \`intercept-sales-2508061117.${primarySite.dataset}.attribution_channel_performance\`
        WHERE date >= '2025-01-01'
          AND sessionSource IS NOT NULL
      `;
      
      if (startDate && endDate) {
        sourcesQuery = sourcesQuery.replace(
          "WHERE date >= '2025-01-01'",
          `WHERE date >= '${startDate}' AND date <= '${endDate}'`
        );
      }
      
      sourcesQuery += `
        GROUP BY sessionSource, sessionMedium
        ORDER BY sessions DESC
        LIMIT 20
      `;
      
      [sourcesRows] = await bigquery.query(sourcesQuery).catch((err: any) => {
        console.error('Sources query failed:', err);
        return [[]];
      });
      
      // Skip geographic data for now - not in attribution tables
      geoRows = [];
    } else if (primarySite) {
      // Fallback to events tables if no attribution data
      console.log('Falling back to events tables for detailed breakdowns');
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