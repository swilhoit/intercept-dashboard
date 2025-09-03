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
      const fileResponse = await graphClient
        .api(`/me/drive/items/${this.config.oneDriveFileId}/content`)
        .get();
      
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
      const table = bigquery.dataset('MASTER').table(this.config.bigQueryTableId);
      
      // Clear existing data (full replace strategy)
      await table.delete({ ignoreNotFound: true });
      
      // Create table with schema inferred from data
      if (data.length > 0) {
        const [job] = await table.createLoadJob(data, {
          sourceFormat: 'JSON',
          writeDisposition: 'WRITE_TRUNCATE',
          autodetect: true,
        });

        await job.promise();
        console.log(`Successfully loaded ${data.length} rows into ${this.config.bigQueryTableId}`);
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