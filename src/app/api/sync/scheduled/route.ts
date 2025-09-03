import { NextRequest, NextResponse } from 'next/server';
import { ExcelSyncService } from '@/lib/excel-sync';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

// Define your sync configurations here
const SYNC_CONFIGS = [
  {
    name: 'Sales Data Sync',
    oneDriveFileId: process.env.SALES_EXCEL_FILE_ID || '',
    bigQueryTableId: 'EXCEL_SALES_DATA',
    sheetName: 'Sales', // Optional: defaults to first sheet
  },
  // Add more sync configurations as needed
];

export async function POST(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  // Verify authorization token (optional security measure)
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.SYNC_AUTH_TOKEN;
  
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const results = [];

    for (const config of SYNC_CONFIGS) {
      if (!config.oneDriveFileId) {
        console.warn(`Skipping ${config.name}: oneDriveFileId not configured`);
        continue;
      }

      console.log(`Starting sync for: ${config.name}`);
      
      const syncService = new ExcelSyncService(config);
      const result = await syncService.sync();
      
      results.push({
        name: config.name,
        ...result,
      });
    }

    const totalRows = results.reduce((sum, r) => sum + r.rowsProcessed, 0);
    const failures = results.filter(r => !r.success);

    return NextResponse.json({
      success: failures.length === 0,
      totalRowsProcessed: totalRows,
      syncCount: results.length,
      results,
      failures: failures.length > 0 ? failures : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  // Return sync configuration status
  const configs = SYNC_CONFIGS.map(config => ({
    name: config.name,
    configured: !!config.oneDriveFileId,
    tableId: config.bigQueryTableId,
  }));

  return NextResponse.json({
    configs,
    totalConfigs: configs.length,
    configuredCount: configs.filter(c => c.configured).length,
  });
}