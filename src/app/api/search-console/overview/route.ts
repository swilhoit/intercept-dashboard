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
    const groupBy = searchParams.get('groupBy') || 'day';
    
    // Define site configurations for Search Console data
    const sites = [
      { 
        name: 'BrickAnew',
        dataset: 'searchconsole_brickanew',
        property: 'sc-domain:brickanew.com',
        domain: 'brickanew.com'
      },
      { 
        name: 'Heatilator Fireplace Doors',
        dataset: 'searchconsole_heatilator',
        property: 'sc-domain:heatilatorfireplacedoors.com',
        domain: 'heatilatorfireplacedoors.com'
      },
      { 
        name: 'Superior Fireplace Doors',
        dataset: 'searchconsole_superior',
        property: 'sc-domain:superiorfireplacedoors.com',
        domain: 'superiorfireplacedoors.com'
      },
      { 
        name: 'WaterWise Group',
        dataset: 'searchconsole_waterwise',
        property: 'sc-domain:waterwisegroup.com',
        domain: 'waterwisegroup.com'
      },
      { 
        name: 'Majestic Fireplace Doors',
        dataset: 'searchconsole_majestic',
        property: 'sc-domain:majesticfireplacedoors.com',
        domain: 'majesticfireplacedoors.com'
      },
      {
        name: 'Fireplace Painting',
        dataset: 'searchconsole_fireplacepainting',
        property: 'sc-domain:fireplacepainting.com',
        domain: 'fireplacepainting.com'
      },
      {
        name: 'Fireplaces.net',
        dataset: 'searchconsole_fireplacesnet',
        property: 'sc-domain:fireplaces.net',
        domain: 'fireplaces.net'
      }
    ];
    
    // Filter sites based on selection
    const sitesToQuery = selectedSite === 'all' 
      ? sites 
      : sites.filter(s => s.domain === selectedSite);
    
    // Build date filter and comparison period
    let dateFilter = '';
    let comparisonFilter = '';
    let currentPeriodDays = 30;
    
    if (startDate && endDate) {
      dateFilter = `AND data_date >= '${startDate}' AND data_date <= '${endDate}'`;
      // Calculate period length and comparison period
      const start = new Date(startDate);
      const end = new Date(endDate);
      currentPeriodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      // Comparison period (same length, immediately before current period)
      const comparisonEnd = new Date(start);
      comparisonEnd.setDate(comparisonEnd.getDate() - 1);
      const comparisonStart = new Date(comparisonEnd);
      comparisonStart.setDate(comparisonStart.getDate() - currentPeriodDays + 1);
      
      comparisonFilter = `AND data_date >= '${comparisonStart.toISOString().split('T')[0]}' AND data_date <= '${comparisonEnd.toISOString().split('T')[0]}'`;
    } else {
      dateFilter = `AND data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
      comparisonFilter = `AND data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY) AND data_date < DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    // Get aggregated metrics for each site
    const siteMetrics = await Promise.all(
      sitesToQuery.map(async (site) => {
        try {
          // Query current period
          const currentQuery = `
            SELECT 
              '${site.domain}' as site,
              '${site.name}' as site_name,
              SUM(clicks) as total_clicks,
              SUM(impressions) as total_impressions,
              ROUND(SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)), 2) as avg_position,
              ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr,
              COUNT(DISTINCT query) as total_queries,
              COUNT(DISTINCT site_url) as total_pages
            FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
            WHERE 1=1 ${dateFilter}
          `;
          
          // Query comparison period
          const comparisonQuery = `
            SELECT 
              SUM(clicks) as prev_total_clicks,
              SUM(impressions) as prev_total_impressions,
              ROUND(SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)), 2) as prev_avg_position,
              ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as prev_ctr,
              COUNT(DISTINCT query) as prev_total_queries,
              COUNT(DISTINCT site_url) as prev_total_pages
            FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
            WHERE 1=1 ${comparisonFilter}
          `;
          
          console.log(`Search Console Current Query for ${site.name}:`, currentQuery);
          console.log(`Search Console Comparison Query for ${site.name}:`, comparisonQuery);
          
          const [[currentRows], [prevRows]] = await Promise.all([
            bigquery.query(currentQuery),
            bigquery.query(comparisonQuery).catch(() => [[]])
          ]);
          
          console.log(`Search Console Current Results for ${site.name}:`, currentRows);
          console.log(`Search Console Previous Results for ${site.name}:`, prevRows);
          
          const current = currentRows[0] || {
            site: site.domain,
            site_name: site.name,
            total_clicks: 0,
            total_impressions: 0,
            avg_position: 0,
            ctr: 0,
            total_queries: 0,
            total_pages: 0
          };
          
          const previous = prevRows[0] || {
            prev_total_clicks: 0,
            prev_total_impressions: 0,
            prev_avg_position: 0,
            prev_ctr: 0,
            prev_total_queries: 0,
            prev_total_pages: 0
          };
          
          // Calculate percentage changes
          const calculateChange = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100 * 100) / 100;
          };
          
          return {
            ...current,
            // Previous period values
            prev_total_clicks: previous.prev_total_clicks,
            prev_total_impressions: previous.prev_total_impressions,
            prev_avg_position: previous.prev_avg_position,
            prev_ctr: previous.prev_ctr,
            prev_total_queries: previous.prev_total_queries,
            prev_total_pages: previous.prev_total_pages,
            // Percentage changes
            clicks_change: calculateChange(current.total_clicks, previous.prev_total_clicks),
            impressions_change: calculateChange(current.total_impressions, previous.prev_total_impressions),
            position_change: calculateChange(previous.prev_avg_position, current.avg_position), // Reversed for position (lower is better)
            ctr_change: calculateChange(current.ctr, previous.prev_ctr),
            queries_change: calculateChange(current.total_queries, previous.prev_total_queries),
            pages_change: calculateChange(current.total_pages, previous.prev_total_pages)
          };
        } catch (error) {
          console.error(`Error querying ${site.name}:`, error);
          console.error(`Full error details:`, {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: (error as any)?.code,
            details: (error as any)?.details,
            errors: (error as any)?.errors
          });
          return {
            site: site.domain,
            site_name: site.name,
            total_clicks: 0,
            total_impressions: 0,
            avg_position: 0,
            ctr: 0,
            total_queries: 0,
            total_pages: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );
    
    // Calculate overall aggregated metrics
    const aggregated = siteMetrics.reduce((acc, site) => ({
      total_clicks: acc.total_clicks + (site.total_clicks || 0),
      total_impressions: acc.total_impressions + (site.total_impressions || 0),
      total_queries: acc.total_queries + (site.total_queries || 0),
      total_pages: acc.total_pages + (site.total_pages || 0),
      site_count: acc.site_count + 1
    }), {
      total_clicks: 0,
      total_impressions: 0,
      total_queries: 0,
      total_pages: 0,
      site_count: 0
    });
    
    // Calculate weighted average position and overall CTR
    const weightedPosition = siteMetrics.reduce((sum, site) => 
      sum + ((site.avg_position || 0) * (site.total_impressions || 0)), 0
    ) / (aggregated.total_impressions || 1);
    
    const overallCtr = aggregated.total_impressions > 0 
      ? (aggregated.total_clicks / aggregated.total_impressions) * 100 
      : 0;
    
    // Get trend data with grouping
    const dateField = groupBy === 'day' ? 'data_date' :
                     groupBy === 'week' ? 'DATE_TRUNC(data_date, WEEK)' :
                     'DATE_TRUNC(data_date, MONTH)';
    
    const trendQueries = sitesToQuery.map(site => `
      SELECT 
        ${dateField} as date,
        '${site.domain}' as site,
        '${site.name}' as site_name,
        SUM(clicks) as clicks,
        SUM(impressions) as impressions,
        ROUND(SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)), 2) as avg_position,
        ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr
      FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
      WHERE 1=1 ${dateFilter}
      GROUP BY ${dateField}
      ORDER BY date ASC
    `);
    
    console.log('Trend queries:', trendQueries);
    
    const trendData = await Promise.all(
      trendQueries.map((query, index) => 
        bigquery.query(query).catch((err: any) => {
          console.error(`Trend query failed for site ${sitesToQuery[index].name}:`, err);
          return [[]];
        })
      )
    );
    
    console.log('Trend data results:', trendData);
    
    // Flatten and combine trend data
    const dailyTrends = trendData.flat().flat();
    
    return NextResponse.json({
      aggregated: {
        ...aggregated,
        avg_position: Math.round(weightedPosition * 100) / 100,
        ctr: Math.round(overallCtr * 100) / 100
      },
      sites: siteMetrics,
      trends: dailyTrends,
      date_range: {
        start: startDate || 'Last 30 days',
        end: endDate || 'Today'
      }
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}
