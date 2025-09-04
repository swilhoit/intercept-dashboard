const { BigQuery } = require('@google-cloud/bigquery');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const fetch = require('node-fetch');
const XLSX = require('xlsx');

// Initialize BigQuery
const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'intercept-sales-2508061117'
});

// MSAL configuration
const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`
  }
};

async function getGraphAccessToken() {
  const cca = new ConfidentialClientApplication(msalConfig);
  const clientCredentialRequest = {
    scopes: ['https://graph.microsoft.com/.default'],
  };
  
  try {
    const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
    return response.accessToken;
  } catch (error) {
    console.error('Error acquiring token:', error);
    throw error;
  }
}

async function downloadExcelFile(fileId) {
  const accessToken = await getGraphAccessToken();
  
  const shareUrlMap = {
    'ET27IzaEhPBOim8JgIJNepUBr38bFsOScEH4UCqiyidk_A': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/ET27IzaEhPBOim8JgIJNepUBr38bFsOScEH4UCqiyidk_A',
    'EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q'
  };
  
  const shareUrl = shareUrlMap[fileId];
  if (!shareUrl) {
    throw new Error(`No share URL found for file ID: ${fileId}`);
  }
  
  const base64Value = Buffer.from(shareUrl).toString('base64');
  const encodedUrl = 'u!' + base64Value.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const sharedItemResponse = await fetch(`https://graph.microsoft.com/v1.0/shares/${encodedUrl}/driveItem`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!sharedItemResponse.ok) {
    throw new Error(`Failed to get shared item: ${sharedItemResponse.statusText}`);
  }
  
  const sharedItem = await sharedItemResponse.json();
  
  const fileResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${sharedItem.parentReference.driveId}/items/${sharedItem.id}/content`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.statusText}`);
  }
  
  return await fileResponse.buffer();
}

async function parseExcelData(buffer, sheetName = 'Funnel data') {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (jsonData.length === 0) return [];
  
  const headers = jsonData[0];
  const rows = jsonData.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  }).filter(row => Object.values(row).some(value => value !== null && value !== ''));
}

async function syncToBigQuery(data, tableId) {
  const [datasetId, tableName] = tableId.split('.');
  const table = bigquery.dataset(datasetId).table(tableName);
  
  if (data.length === 0) {
    console.log(`No data to sync for ${tableId}`);
    return 0;
  }
  
  // Clean field names for BigQuery compatibility
  const cleanData = data.map(row => {
    const cleanRow = {};
    Object.keys(row).forEach(key => {
      let cleanKey = key;
      
      if (key.includes('Item Price')) {
        cleanKey = 'Item_Price';
      } else if (key.includes('Product Name')) {
        cleanKey = 'Product_Name';
      } else if (key.includes('Purchase Date')) {
        cleanKey = 'Purchase_Date';
      } else {
        cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      }
      
      cleanRow[cleanKey] = row[key];
    });
    return cleanRow;
  });
  
  await table.insert(cleanData, { createInsertId: false });
  return cleanData.length;
}

exports.syncAmazonData = async (req, res) => {
  console.log('Starting scheduled Amazon data sync...');
  
  const configs = [
    {
      name: 'Amazon Orders 2025',
      fileId: process.env.SALES_EXCEL_FILE_ID,
      tableId: 'amazon_seller.amazon_orders_2025',
      sheetName: 'Funnel data'
    },
    {
      name: 'Amazon Ads Keywords', 
      fileId: process.env.AMAZON_ADS_EXCEL_FILE_ID,
      tableId: 'amazon_ads.keywords',
      sheetName: 'Funnel data'
    }
  ];
  
  const results = [];
  
  for (const config of configs) {
    if (!config.fileId) {
      console.log(`Skipping ${config.name}: No file ID configured`);
      continue;
    }
    
    try {
      console.log(`Syncing: ${config.name}`);
      
      const buffer = await downloadExcelFile(config.fileId);
      const data = await parseExcelData(buffer, config.sheetName);
      const rowsProcessed = await syncToBigQuery(data, config.tableId);
      
      results.push({
        name: config.name,
        success: true,
        rowsProcessed: rowsProcessed
      });
      
      console.log(`✓ ${config.name}: ${rowsProcessed} rows processed`);
      
    } catch (error) {
      console.error(`✗ ${config.name}: ${error.message}`);
      results.push({
        name: config.name,
        success: false,
        rowsProcessed: 0,
        error: error.message
      });
    }
  }
  
  res.status(200).json({
    timestamp: new Date().toISOString(),
    results: results,
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  });
};