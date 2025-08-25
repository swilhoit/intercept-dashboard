import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
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

    const results = [];

    for (const site of sites) {
      try {
        // Test if dataset exists by trying to query the table schema
        const schemaQuery = `
          SELECT table_name, column_name, data_type
          FROM \`intercept-sales-2508061117.${site.dataset}.INFORMATION_SCHEMA.COLUMNS\`
          WHERE table_name = 'searchdata_site_impression'
          LIMIT 5
        `;
        
        console.log(`Testing dataset ${site.dataset}:`, schemaQuery);
        const [schemaRows] = await bigquery.query(schemaQuery);
        
        // Test if we can query actual data
        const dataQuery = `
          SELECT COUNT(*) as row_count, 
                 MIN(data_date) as earliest_date, 
                 MAX(data_date) as latest_date
          FROM \`intercept-sales-2508061117.${site.dataset}.searchdata_site_impression\`
          LIMIT 1
        `;
        
        console.log(`Testing data for ${site.dataset}:`, dataQuery);
        const [dataRows] = await bigquery.query(dataQuery);
        
        results.push({
          site: site.name,
          dataset: site.dataset,
          domain: site.domain,
          status: 'success',
          schema: schemaRows,
          data_info: dataRows[0],
          has_data: dataRows[0]?.row_count > 0
        });
        
      } catch (error) {
        console.error(`Error testing ${site.name}:`, error);
        results.push({
          site: site.name,
          dataset: site.dataset,
          domain: site.domain,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          error_code: (error as any)?.code,
          error_details: (error as any)?.details
        });
      }
    }

    return NextResponse.json({
      test_results: results,
      summary: {
        total_sites: sites.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        with_data: results.filter(r => r.has_data).length
      }
    });
    
  } catch (error) {
    return handleApiError(error);
  }
}
