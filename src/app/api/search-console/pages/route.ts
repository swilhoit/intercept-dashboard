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
    
    // Get top performing pages
    const pageData = await Promise.all(
      sitesToQuery.map(async (site) => {
        try {
          const query = `
            SELECT 
              page,
              '${site.domain}' as site,
              '${site.name}' as site_name,
              SUM(clicks) as clicks,
              SUM(impressions) as impressions,
              ROUND(AVG(position), 2) as avg_position,
              ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) as ctr
            FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
            WHERE page IS NOT NULL 
              AND page != '' 
              ${dateFilter}
            GROUP BY page
            ORDER BY clicks DESC
            LIMIT ${limit}
          `;
          
          console.log(`Top Pages Query for ${site.name}:`, query);
          const [rows] = await bigquery.query(query);
          return rows;
        } catch (error) {
          console.error(`Error querying top pages for ${site.name}:`, error);
          return [];
        }
      })
    );
    
    // Flatten and combine all page data
    const allPages = pageData.flat();
    
    // Sort by clicks and limit
    const processedPages = allPages
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, limit)
      .map(page => ({
        ...page,
        // Clean up page URL for display
        page_path: page.page ? new URL(page.page).pathname : page.page,
        full_url: page.page
      }));
    
    return NextResponse.json({
      pages: processedPages,
      total_pages: processedPages.length,
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
