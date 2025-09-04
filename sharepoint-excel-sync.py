#!/usr/bin/env python3
"""
Automated SharePoint Excel data extraction and BigQuery sync
Uses Microsoft Graph API to authenticate and fetch Excel data programmatically
"""

import os
import requests
import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import json
from urllib.parse import urlparse, parse_qs

# Microsoft Graph API endpoints
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
AUTH_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

class SharePointExcelSync:
    def __init__(self, tenant_id, client_id, client_secret):
        self.tenant_id = tenant_id
        self.client_id = client_id  
        self.client_secret = client_secret
        self.access_token = None
        
    def authenticate(self):
        """Get access token using client credentials flow"""
        auth_url = AUTH_URL.format(tenant_id=self.tenant_id)
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'client_credentials',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'scope': 'https://graph.microsoft.com/.default'
        }
        
        response = requests.post(auth_url, headers=headers, data=data)
        response.raise_for_status()
        
        token_data = response.json()
        self.access_token = token_data['access_token']
        print("✅ Authenticated with Microsoft Graph API")
        
    def parse_sharepoint_url(self, sharepoint_url):
        """Extract site ID and file details from SharePoint URL"""
        # Extract the personal site info from the URL
        # URL format: https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/...
        
        if "tetrahedronglobal-my.sharepoint.com" in sharepoint_url:
            site_url = "https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com"
            
            # Extract file ID from the URL - it's the base64 encoded part
            parsed = urlparse(sharepoint_url)
            path_parts = parsed.path.split('/')
            
            # Look for the encoded file identifier
            for part in path_parts:
                if len(part) > 20 and any(c.isalnum() for c in part):
                    file_id = part
                    break
            else:
                # Try to extract from query parameters
                query_params = parse_qs(parsed.fragment) if parsed.fragment else parse_qs(parsed.query)
                file_id = None
                
        return site_url, file_id
        
    def get_site_id(self, site_url):
        """Get SharePoint site ID"""
        # Extract hostname and site path
        parsed = urlparse(site_url)
        hostname = parsed.hostname
        site_path = parsed.path
        
        url = f"{GRAPH_BASE_URL}/sites/{hostname}:{site_path}"
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()['id']
        else:
            print(f"Error getting site ID: {response.status_code} - {response.text}")
            return None
    
    def list_drive_items(self, site_id):
        """List all files in the SharePoint drive to find our Excel file"""
        url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive/root/children"
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()['value']
        else:
            print(f"Error listing drive items: {response.status_code} - {response.text}")
            return []
    
    def search_for_excel_file(self, site_id, search_term="amazon ads"):
        """Search for Excel files containing the search term"""
        url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive/root/search(q='{search_term}')"
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            files = response.json()['value']
            excel_files = [f for f in files if f['name'].endswith(('.xlsx', '.xls'))]
            return excel_files
        else:
            print(f"Error searching files: {response.status_code} - {response.text}")
            return []
    
    def get_excel_worksheets(self, site_id, file_id):
        """Get all worksheets in the Excel file"""
        url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive/items/{file_id}/workbook/worksheets"
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()['value']
        else:
            print(f"Error getting worksheets: {response.status_code} - {response.text}")
            return []
    
    def get_worksheet_data(self, site_id, file_id, worksheet_name=None):
        """Get data from Excel worksheet"""
        if worksheet_name:
            url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive/items/{file_id}/workbook/worksheets('{worksheet_name}')/usedRange"
        else:
            url = f"{GRAPH_BASE_URL}/sites/{site_id}/drive/items/{file_id}/workbook/worksheets/$/usedRange"
            
        headers = {'Authorization': f'Bearer {self.access_token}'}
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            range_data = response.json()
            values = range_data['values']
            
            if values:
                # First row as column headers
                columns = values[0]
                data = values[1:]
                
                # Create DataFrame
                df = pd.DataFrame(data, columns=columns)
                return df
            else:
                print("No data found in worksheet")
                return pd.DataFrame()
        else:
            print(f"Error getting worksheet data: {response.status_code} - {response.text}")
            return pd.DataFrame()
    
    def process_amazon_ads_data(self, df):
        """Process and clean Amazon ads data"""
        print(f"Original data shape: {df.shape}")
        print(f"Columns: {df.columns.tolist()}")
        
        # Convert date columns
        date_columns = [col for col in df.columns if 'date' in col.lower()]
        for col in date_columns:
            try:
                df[col] = pd.to_datetime(df[col])
                print(f"Converted {col} to datetime")
            except:
                print(f"Could not convert {col} to datetime")
        
        # Convert numeric columns
        numeric_columns = ['impressions', 'clicks', 'spend', 'cost', 'sales', 'orders', 'units']
        for col in df.columns:
            if any(keyword in col.lower() for keyword in numeric_columns):
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                    print(f"Converted {col} to numeric")
                except:
                    print(f"Could not convert {col} to numeric")
        
        # Remove rows with all NaN values
        df = df.dropna(how='all')
        
        print(f"Processed data shape: {df.shape}")
        return df

def main():
    # Configuration from environment variables
    TENANT_ID = os.getenv("MICROSOFT_TENANT_ID")
    CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID")
    CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET")
    
    SHAREPOINT_URL = "https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/Ea3FPQFUZwJMvXg3FNgJZf4BaA8Apz88Bw7FZwRUlSWoFw?e=AMFbgQ&nav=MTVfezMxRTU1MTJCLUJDODItNENCNy04OTNELTNCOTYzNTFEOThGOH0"
    
    # Initialize SharePoint sync
    sync = SharePointExcelSync(TENANT_ID, CLIENT_ID, CLIENT_SECRET)
    
    try:
        # Authenticate
        sync.authenticate()
        
        # Get site information
        site_url, file_id = sync.parse_sharepoint_url(SHAREPOINT_URL)
        print(f"Site URL: {site_url}")
        
        site_id = sync.get_site_id(site_url)
        if not site_id:
            print("Could not get site ID, trying to search for files...")
            
            # Alternative: search for Amazon ads files
            excel_files = sync.search_for_excel_file(site_id or "root", "amazon")
            print(f"Found {len(excel_files)} Excel files:")
            for file in excel_files[:5]:  # Show first 5
                print(f"  - {file['name']} (ID: {file['id']})")
                
            if excel_files:
                file_id = excel_files[0]['id']  # Use first match
                print(f"Using file: {excel_files[0]['name']}")
        
        # Get worksheets
        worksheets = sync.get_excel_worksheets(site_id, file_id)
        print(f"Found {len(worksheets)} worksheets:")
        for sheet in worksheets:
            print(f"  - {sheet['name']}")
        
        # Get data from first worksheet (or specify which one you want)
        worksheet_name = worksheets[0]['name'] if worksheets else None
        df = sync.get_worksheet_data(site_id, file_id, worksheet_name)
        
        if not df.empty:
            print(f"\n📊 Successfully extracted data!")
            print(f"Shape: {df.shape}")
            print(f"Date range: {df.iloc[:, 0].min()} to {df.iloc[:, 0].max()}")
            
            # Process the data
            df_processed = sync.process_amazon_ads_data(df)
            
            # Save locally for inspection
            df_processed.to_csv('amazon_ads_extracted.csv', index=False)
            print("✅ Data saved to amazon_ads_extracted.csv")
            
            # TODO: Upload to BigQuery
            print("\n🚀 Ready to upload to BigQuery!")
            
        else:
            print("❌ No data extracted")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()