import { getGraphClient } from './microsoft-graph';
import { bigquery } from './bigquery';
import * as XLSX from 'xlsx';

export interface ExcelSyncConfig {
  oneDriveFileId: string;
  bigQueryTableId: string;
  sheetName?: string;
  primaryKeyColumn?: string;
  transformData?: boolean;
}

export class ExcelSyncService {
  private config: ExcelSyncConfig;

  constructor(config: ExcelSyncConfig) {
    this.config = config;
  }

  async downloadExcelFromOneDrive(): Promise<Buffer> {
    try {
      const graphClient = getGraphClient();
      
      // Map SharePoint IDs to actual share URLs
      const shareUrlMap: { [key: string]: string } = {
        'ET27IzaEhPBOim8JgIJNepUBr38bFsOScEH4UCqiyidk_A': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/ET27IzaEhPBOim8JgIJNepUBr38bFsOScEH4UCqiyidk_A',
        'EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q',
        'EVVhQiD7dYdAqleBi6wfX04BdnHuCyhrzfK1-XxGvR11TQ': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EVVhQiD7dYdAqleBi6wfX04BdnHuCyhrzfK1-XxGvR11TQ',
        'EYsjv8DaHP1HqWgIfueicnABjPhAL9ic6j1uiWs8EKTbXw': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EYsjv8DaHP1HqWgIfueicnABjPhAL9ic6j1uiWs8EKTbXw',
        // Amazon Ads files
        'CC188F9ABEE74538B3DF5577A3A500D8': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx',
        '013DC5AD67544C02BD783714D80965FE': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'BDBC5289A91B4A2291BF21B443C1EE12': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx'
      };
      
      const shareUrl = shareUrlMap[this.config.oneDriveFileId];
      if (!shareUrl) {
        throw new Error(`No share URL found for file ID: ${this.config.oneDriveFileId}`);
      }
      
      // Encode the share URL for the API
      const base64Value = Buffer.from(shareUrl).toString('base64');
      const encodedUrl = 'u!' + base64Value.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      
      // Get the shared item
      const sharedItem = await graphClient
        .api(`/shares/${encodedUrl}/driveItem`)
        .get();
      
      // Download the file content
      const fileResponse = await graphClient
        .api(`/drives/${sharedItem.parentReference.driveId}/items/${sharedItem.id}/content`)
        .get();
      
      // Convert ReadableStream to Buffer
      if (fileResponse instanceof ReadableStream) {
        const reader = fileResponse.getReader();
        const chunks: Uint8Array[] = [];
        let done = false;
        
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          if (value) chunks.push(value);
          done = readerDone;
        }
        
        return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
      }
      
      return Buffer.from(fileResponse);
    } catch (error) {
      console.error('Error downloading Excel file from OneDrive:', error);
      throw error;
    }
  }

  parseExcelData(buffer: Buffer): any[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      console.log('Available sheet names:', workbook.SheetNames);

      const sheetName = this.config.sheetName || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file. Available sheets: ${workbook.SheetNames.join(', ')}`);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        raw: false, // Convert dates to strings instead of numbers
      });

      if (jsonData.length === 0) {
        return [];
      }

      // First row contains headers
      const headers = jsonData[0] as string[];
      const rows = jsonData.slice(1) as any[][];

      // Convert to object array
      return rows.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          let value = row[index];

          // Convert Excel date serial numbers to proper dates
          if (header === 'Date' && typeof value === 'number' && value > 40000) {
            // Excel serial date conversion
            const excelEpoch = new Date(1899, 11, 30); // Excel's epoch
            const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
            value = date.toISOString().split('T')[0]; // YYYY-MM-DD format
          }

          obj[header] = value;
        });
        return obj;
      }).filter(row => {
        // Filter out completely empty rows
        return Object.values(row).some(value => value !== null && value !== '');
      });
    } catch (error) {
      console.error('Error parsing Excel data:', error);
      throw error;
    }
  }

  async updateBigQueryTable(data: any[]): Promise<void> {
    if (!bigquery) {
      throw new Error('BigQuery client not initialized');
    }

    try {
      const [datasetId, tableId] = this.config.bigQueryTableId.includes('.') 
        ? this.config.bigQueryTableId.split('.')
        : ['MASTER', this.config.bigQueryTableId];
      
      const table = bigquery.dataset(datasetId).table(tableId);
      
      // Check if table exists and has schema, recreate if needed
      try {
        const [exists] = await table.exists();
        if (!exists) {
          console.log(`Table ${this.config.bigQueryTableId} does not exist, will be created during load job`);
        } else {
          // Check if table has schema
          const [metadata] = await table.getMetadata();
          if (!metadata.schema || !metadata.schema.fields || metadata.schema.fields.length === 0) {
            console.log(`Table ${this.config.bigQueryTableId} exists but has no schema, recreating...`);
            await table.delete();
          }
        }
      } catch (tableError) {
        console.error('Error checking table:', tableError);
      }
      
      // Insert data if we have data
      if (data.length > 0) {
        try {
          // For initial sync, skip deletion to avoid streaming buffer issues
          // TODO: Implement upsert logic for production
          
          // Clean data field names to match BigQuery schema
          const cleanData = data.map(row => {
            const cleanRow: any = {};
            Object.keys(row).forEach(key => {
              // Create a clean field name mapping for Amazon data
              let cleanKey = key;
              
              // Handle specific Amazon field mappings
              if (key.includes('Item Price')) {
                cleanKey = 'Item_Price';
              } else if (key.includes('Product Name')) {
                cleanKey = 'Product_Name';
              } else if (key.includes('Purchase Date')) {
                cleanKey = 'Purchase_Date';
              } else {
                // General cleaning: replace non-alphanumeric with single underscore
                cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
              }
              
              cleanRow[cleanKey] = row[key];
            });
            return cleanRow;
          });
          
          // Try to insert data directly, which will auto-create the table schema
          await table.insert(cleanData, { 
            createInsertId: false,
            schema: { autodetect: true }
          });
          console.log(`Successfully loaded ${cleanData.length} rows into ${this.config.bigQueryTableId}`);
        } catch (insertError: any) {
          if (insertError.name === 'PartialFailureError') {
            console.error('Some rows failed to insert:', insertError.errors);
            console.error('Failed rows sample:', insertError.errors?.[0]);
            throw new Error(`Partial insert failure: ${insertError.errors?.length || 0} rows failed`);
          }
          throw insertError;
        }
      }
    } catch (error) {
      console.error('Error updating BigQuery table:', error);
      throw error;
    }
  }

  transformSharePointData(data: any[]): any[] {
    // Transform SharePoint Amazon ads data to match expected schema
    if (data.length === 0) return data;

    console.log('Transforming SharePoint data to match database schema...');
    console.log('Raw data columns:', Object.keys(data[0] || {}));

    return data.map(row => {
      // Convert Excel date serial numbers to proper dates
      let date = null;
      if (row.Date) {
        if (typeof row.Date === 'number' && row.Date > 40000) {
          const excelEpoch = new Date(1899, 11, 30);
          date = new Date(excelEpoch.getTime() + row.Date * 24 * 60 * 60 * 1000);
        } else if (typeof row.Date === 'string') {
          date = new Date(row.Date);
        }
      }

      // Map SharePoint columns to database schema
      const transformed = {
        date: date || new Date(),
        campaign_id: row['Campaign ID'] || null,
        campaign_name: row['Campaign Name'] || null,
        campaign_status: row['Campaign Status'] || null,
        ad_group_id: row['Ad Group ID'] || null,
        ad_group_name: row['Ad Group Name'] || null,
        portfolio_name: row['Portfolio Name'] || null,
        clicks: parseInt(row['Clicks']) || 0,
        cost: parseFloat(row['Cost (*)']) || 0,
        impressions: parseInt(row['Impressions']) || 0,
        conversions_1d_total: parseInt(row['1 Day Total Conversions']) || 0,
        conversions_1d_sku: parseInt(row['1 Day Advertised SKU Conversions']) || 0,
        conversions_7d_total: parseInt(row['7 Day Total Conversions']) || 0,
        conversions_7d_sku: parseInt(row['7 Day Advertised SKU Conversions']) || 0,
        conversions_14d_total: parseInt(row['14 Day Total Conversions']) || 0,
        conversions_14d_sku: parseInt(row['14 Day Advertised SKU Conversions']) || 0,
        conversions_30d_total: parseInt(row['30 Day Total Conversions']) || 0,
        conversions_30d_sku: parseInt(row['30 Day Advertised SKU Conversions']) || 0,
        units_1d_total: parseInt(row['1 Day Total Units']) || 0,
        units_1d_sku: parseInt(row['1 Day Advertised SKU Units']) || 0,
        units_7d_total: parseInt(row['7 Day Total Units']) || 0,
        units_7d_sku: parseInt(row['7 Day Advertised SKU Units']) || 0,
        units_14d_total: parseInt(row['14 Day Total Units']) || 0,
        units_14d_sku: parseInt(row['14 Day Advertised SKU Units']) || 0,
        units_30d_total: parseInt(row['30 Day Total Units']) || 0,
        units_30d_sku: parseInt(row['30 Day Advertised SKU Units']) || 0,
        sales_1d_total: parseFloat(row['1 Day Total Sales (*)']) || 0,
        sales_1d_sku: parseFloat(row['1 Day Advertised SKU Sales (*)']) || 0,
        sales_7d_total: parseFloat(row['7 Day Total Sales (*)']) || 0,
        sales_7d_sku: parseFloat(row['7 Day Advertised SKU Sales (*)']) || 0,
        sales_14d_total: parseFloat(row['14 Day Total Sales (*)']) || 0,
        sales_14d_sku: parseFloat(row['14 Day Advertised SKU Sales (*)']) || 0,
        sales_30d_total: parseFloat(row['30 Day Total Sales (*)']) || 0,
        sales_30d_sku: parseFloat(row['30 Day Advertised SKU Sales (*)']) || 0,
      };

      return transformed;
    }).filter(row => {
      // Only include rows with valid campaign data and recent dates
      const isValidCampaign = row.campaign_id;
      const hasValidDate = row.date && row.date instanceof Date && !isNaN(row.date.getTime());
      const isRecentDate = hasValidDate && row.date >= new Date('2025-09-05');
      const hasActivity = (row.clicks > 0 || row.impressions > 0 || row.cost > 0);

      console.log(`Filter check for campaign ${row.campaign_id}: valid=${isValidCampaign}, date=${hasValidDate}, recent=${isRecentDate}, activity=${hasActivity}`);

      return isValidCampaign && hasValidDate && isRecentDate && hasActivity;
    });
  }

  async sync(): Promise<{ success: boolean; rowsProcessed: number; error?: string }> {
    try {
      console.log(`Starting sync for file ${this.config.oneDriveFileId} to table ${this.config.bigQueryTableId}`);
      
      // Download Excel file from OneDrive
      const excelBuffer = await this.downloadExcelFromOneDrive();
      
      // Parse Excel data
      let parsedData = this.parseExcelData(excelBuffer);

      // Transform data if needed
      if (this.config.transformData) {
        console.log(`Transforming data: ${parsedData.length} raw rows`);
        console.log('Sample raw row:', JSON.stringify(parsedData[0], null, 2));
        parsedData = this.transformSharePointData(parsedData);
        console.log(`After transformation: ${parsedData.length} rows`);
        console.log('Sample transformed row:', JSON.stringify(parsedData[0], null, 2));
      }

      // Update BigQuery table
      await this.updateBigQueryTable(parsedData);
      
      console.log(`Sync completed successfully. Processed ${parsedData.length} rows.`);
      
      return {
        success: true,
        rowsProcessed: parsedData.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Sync failed:', errorMessage);
      
      return {
        success: false,
        rowsProcessed: 0,
        error: errorMessage,
      };
    }
  }
}