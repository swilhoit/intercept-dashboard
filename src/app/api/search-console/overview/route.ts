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
        name: 'Brick Anew',
        dataset: 'searchconsole_brickanew',
        property: 'sc-domain:brickanew.com',
        domain: 'brickanew.com'
      },
      { 
        name: 'Heatilator',
        dataset: 'searchconsole_heatilator',
        property: 'sc-domain:heatilator.com',
        domain: 'heatilator.com'
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
    
    // Build date filter
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `AND data_date >= '${startDate}' AND data_date <= '${endDate}'`;
    } else {
      dateFilter = `AND data_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`;
    }
    
    // Get aggregated metrics for each site
    const siteMetrics = await Promise.all(
      sitesToQuery.map(async (site) => {
        try {
          const query = `
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
          
          console.log(`Search Console Query for ${site.name}:`, query);
          const [rows] = await bigquery.query(query);
          console.log(`Search Console Results for ${site.name}:`, rows);
          return rows[0] || {
            site: site.domain,
            site_name: site.name,
            total_clicks: 0,
            total_impressions: 0,
            avg_position: 0,
            ctr: 0,
            total_queries: 0,
            total_pages: 0
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
