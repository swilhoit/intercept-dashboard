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
    const limit = parseInt(searchParams.get('limit') || '50');
    
    // Define site configurations
    const sites = [
      { 
        name: 'Brick Anew',
        dataset: 'searchconsole_brickanew',
        domain: 'brickanew.com'
      },
      { 
        name: 'Heatilator',
        dataset: 'searchconsole_heatilator',
        domain: 'heatilator.com'
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
    
    // Get top performing queries
    const queryData = await Promise.all(
      sitesToQuery.map(async (site) => {
        try {
          const query = `
            SELECT 
              query,
              '${site.domain}' as site,
              '${site.name}' as site_name,
              SUM(clicks) as clicks,
              SUM(impressions) as impressions,
              ROUND(AVG(avg_position), 2) as avg_position,
              ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr
            FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
            WHERE query IS NOT NULL 
              AND query != '' 
              ${dateFilter}
            GROUP BY query
            ORDER BY clicks DESC
            LIMIT ${limit}
          `;
          
          console.log(`Top Queries Query for ${site.name}:`, query);
          const [rows] = await bigquery.query(query);
          return rows;
        } catch (error) {
          console.error(`Error querying top queries for ${site.name}:`, error);
          return [];
        }
      })
    );
    
    // Flatten and combine all query data
    const allQueries = queryData.flat();
    
    // If we're looking at all sites, aggregate similar queries
    let processedQueries;
    if (selectedSite === 'all') {
      const aggregatedQueries = new Map();
      
      allQueries.forEach(row => {
        const key = row.query;
        if (aggregatedQueries.has(key)) {
          const existing = aggregatedQueries.get(key);
          existing.clicks += row.clicks || 0;
          existing.impressions += row.impressions || 0;
          existing.sites = [...new Set([...existing.sites, row.site])];
          // Recalculate weighted average position
          existing.avg_position = (existing.avg_position + row.avg_position) / 2;
        } else {
          aggregatedQueries.set(key, {
            ...row,
            sites: [row.site]
          });
        }
      });
      
      processedQueries = Array.from(aggregatedQueries.values())
        .map(query => ({
          ...query,
          ctr: query.impressions > 0 ? (query.clicks / query.impressions) * 100 : 0,
          site_count: query.sites.length
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit);
    } else {
      processedQueries = allQueries;
    }
    
    return NextResponse.json({
      queries: processedQueries,
      total_queries: processedQueries.length,
      site_filter: selectedSite,
      date_range: {
        start: startDate || 'Last 30 days',
        end: endDate || 'Today'
      }
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}
