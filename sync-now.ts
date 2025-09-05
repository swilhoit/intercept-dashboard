import { ExcelSyncService } from './src/lib/excel-sync';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function runSync() {
  const configs = [
    {
      name: 'Amazon Orders 2025',
      oneDriveFileId: process.env.SALES_EXCEL_FILE_ID || '',
      bigQueryTableId: 'amazon_seller.amazon_orders_2025',
      sheetName: 'Funnel data',
    },
    {
      name: 'Amazon Ads Keywords',
      oneDriveFileId: process.env.AMAZON_ADS_EXCEL_FILE_ID || '',
      bigQueryTableId: 'amazon_ads.keywords',
      sheetName: 'Funnel data',
    },
    {
      name: 'Amazon Sales and Traffic',
      oneDriveFileId: 'EVVhQiD7dYdAqleBi6wfX04BdnHuCyhrzfK1-XxGvR11TQ',
      bigQueryTableId: 'amazon_data.sales_traffic',
      sheetName: 'Funnel data',
    },
    {
      name: 'Amazon Returns',
      oneDriveFileId: 'EYsjv8DaHP1HqWgIfueicnABjPhAL9ic6j1uiWs8EKTbXw',
      bigQueryTableId: 'amazon_data.returns',
      sheetName: 'Funnel data',
    }
  ];

  for (const config of configs) {
    if (!config.oneDriveFileId) continue;
    
    console.log(`Syncing: ${config.name}`);
    const service = new ExcelSyncService(config);
    const result = await service.sync();
    
    if (result.success) {
      console.log(`✓ ${config.name}: ${result.rowsProcessed} rows`);
    } else {
      console.error(`✗ ${config.name}: ${result.error}`);
    }
  }
}

runSync().catch(console.error);