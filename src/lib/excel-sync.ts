import { getGraphClient } from './microsoft-graph';
import { bigquery } from './bigquery';
import * as XLSX from 'xlsx';

export interface ExcelSyncConfig {
  oneDriveFileId: string;
  bigQueryTableId: string;
  sheetName?: string;
  primaryKeyColumn?: string;
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
        'EYsjv8DaHP1HqWgIfueicnABjPhAL9ic6j1uiWs8EKTbXw': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EYsjv8DaHP1HqWgIfueicnABjPhAL9ic6j1uiWs8EKTbXw'
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
      const sheetName = this.config.sheetName || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file`);
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
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
          obj[header] = row[index];
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

  async sync(): Promise<{ success: boolean; rowsProcessed: number; error?: string }> {
    try {
      console.log(`Starting sync for file ${this.config.oneDriveFileId} to table ${this.config.bigQueryTableId}`);
      
      // Download Excel file from OneDrive
      const excelBuffer = await this.downloadExcelFromOneDrive();
      
      // Parse Excel data
      const parsedData = this.parseExcelData(excelBuffer);
      
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