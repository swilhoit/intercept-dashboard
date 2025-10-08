import { NextRequest, NextResponse } from 'next/server';
import { ExcelSyncService } from '@/lib/excel-sync';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const body = await request.json();
    const { oneDriveFileId, bigQueryTableId, sheetName, primaryKeyColumn } = body;

    if (!oneDriveFileId || !bigQueryTableId) {
      return NextResponse.json(
        { error: 'oneDriveFileId and bigQueryTableId are required' },
        { status: 400 }
      );
    }

    // Check for required Microsoft Graph environment variables
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET || !process.env.MICROSOFT_TENANT_ID) {
      return NextResponse.json(
        { error: 'Microsoft Graph API credentials not configured' },
        { status: 500 }
      );
    }

    const syncService = new ExcelSyncService({
      oneDriveFileId,
      bigQueryTableId,
      sheetName,
      primaryKeyColumn,
    });

    const result = await syncService.sync();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully synced ${result.rowsProcessed} rows`,
        rowsProcessed: result.rowsProcessed,
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Sync failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  // Return sync status or configuration info
  const hasGraphConfig = !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  );

  const hasBigQueryConfig = !!(
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );

  return NextResponse.json({
    configured: hasGraphConfig && hasBigQueryConfig,
    microsoftGraph: hasGraphConfig,
    bigQuery: hasBigQueryConfig,
    requiredEnvVars: {
      microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'],
      bigQuery: ['GOOGLE_CLOUD_PROJECT_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON (or Application Default Credentials)'],
    },
  });
}