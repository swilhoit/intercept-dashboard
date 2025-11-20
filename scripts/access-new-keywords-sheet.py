#!/usr/bin/env python3
"""
Access the new keywords SharePoint sheet and analyze its structure
"""

import os
import requests
import pandas as pd
from datetime import datetime, timedelta
import json
from urllib.parse import urlparse, parse_qs

def authenticate():
    """Get access token"""
    tenant_id = os.getenv("MICROSOFT_TENANT_ID")
    client_id = os.getenv("MICROSOFT_CLIENT_ID") 
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")
    
    auth_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://graph.microsoft.com/.default'
    }
    
    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()
    
    return response.json()['access_token']

def get_sharepoint_site():
    """Get SharePoint site information"""
    access_token = authenticate()
    
    hostname = "tetrahedronglobal-my.sharepoint.com"
    site_path = "/personal/swilhoit_tetrahedronglobal_onmicrosoft_com"
    
    headers = {'Authorization': f'Bearer {access_token}'}
    
    url = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        site_info = response.json()
        print(f"✅ Got site info: {site_info['displayName']}")
        return site_info['id'], access_token
    else:
        print(f"Site access failed: {response.status_code} - {response.text}")
        return None, access_token

def extract_file_id_from_url(sharepoint_url):
    """Extract file ID from SharePoint URL"""
    # The URL format contains an encoded file ID
    # https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q
    
    parsed = urlparse(sharepoint_url)
    path_parts = parsed.path.split('/')
    
    for part in path_parts:
        if len(part) > 30 and not part.startswith('personal'):
            # This looks like the encoded file ID
            return part
    
    return None

def list_all_files(site_id, access_token):
    """List all files in the drive"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/children"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        files = response.json()['value']
        excel_files = [f for f in files if f['name'].endswith(('.xlsx', '.xls'))]
        
        print(f"\n📊 Found {len(excel_files)} Excel files in drive:")
        for i, file in enumerate(excel_files):
            print(f"  {i+1}. {file['name']} (ID: {file['id']}) - Modified: {file.get('lastModifiedDateTime', 'Unknown')}")
            
        return excel_files
    else:
        print(f"❌ Cannot list files: {response.status_code} - {response.text}")
        return []

def search_for_file_by_name(site_id, access_token, search_terms=['keyword']):
    """Search for files by name"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    for term in search_terms:
        url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/search(q='{term}')"
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            files = response.json()['value']
            excel_files = [f for f in files if f['name'].endswith(('.xlsx', '.xls'))]
            
            if excel_files:
                print(f"\n📊 Found {len(excel_files)} Excel files matching '{term}':")
                for i, file in enumerate(excel_files):
                    print(f"  {i+1}. {file['name']} (ID: {file['id']}) - Modified: {file.get('lastModifiedDateTime', 'Unknown')}")
                    
                return excel_files
    
    return []

def access_excel_file(site_id, file_id, access_token):
    """Access Excel file and extract all worksheets"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Get file info
    file_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}"
    response = requests.get(file_url, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Cannot access file: {response.status_code} - {response.text}")
        return None
    
    file_info = response.json()
    print(f"\n✅ Accessing file: {file_info['name']}")
    
    # Get worksheets
    worksheets_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}/workbook/worksheets"
    response = requests.get(worksheets_url, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Cannot get worksheets: {response.status_code} - {response.text}")
        return None
    
    worksheets = response.json()['value']
    print(f"📋 Found {len(worksheets)} worksheets:")
    for sheet in worksheets:
        print(f"  - {sheet['name']}")
    
    all_data = {}
    
    # Extract data from each worksheet
    for sheet in worksheets:
        sheet_name = sheet['name']
        print(f"\n🔍 Extracting data from '{sheet_name}'...")
        
        data_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}/workbook/worksheets('{sheet_name}')/usedRange"
        response = requests.get(data_url, headers=headers)
        
        if response.status_code == 200:
            range_data = response.json()
            values = range_data.get('values', [])
            
            if values and len(values) > 1:
                # Create DataFrame
                df = pd.DataFrame(values[1:], columns=values[0])
                print(f"  ✅ Extracted {len(df)} rows with {len(df.columns)} columns")
                
                # Show first few column names
                print(f"  📊 Columns: {', '.join(df.columns[:10])}{'...' if len(df.columns) > 10 else ''}")
                
                # Save to CSV
                filename = f"{file_info['name'].replace('.xlsx', '')}_{sheet_name.replace(' ', '_')}_data.csv"
                df.to_csv(filename, index=False)
                print(f"  💾 Saved to {filename}")
                
                all_data[sheet_name] = {
                    'dataframe': df,
                    'filename': filename,
                    'shape': df.shape,
                    'columns': list(df.columns)
                }
            else:
                print(f"  ❌ No data found in '{sheet_name}'")
        else:
            print(f"  ❌ Cannot access '{sheet_name}': {response.status_code}")
    
    return all_data

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper datetime"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        # Excel counts from January 1, 1900 (with leap year bug)
        excel_epoch = datetime(1899, 12, 30)
        return excel_epoch + timedelta(days=int(float(serial_date)))
    except (ValueError, TypeError):
        return None

def analyze_data_structure(all_data):
    """Analyze the data structure and identify date columns"""
    print(f"\n{'='*80}")
    print("📊 DATA STRUCTURE ANALYSIS")
    print(f"{'='*80}")
    
    for sheet_name, data in all_data.items():
        df = data['dataframe']
        print(f"\n📋 Sheet: {sheet_name}")
        print(f"   Shape: {data['shape']}")
        print(f"   Columns ({len(data['columns'])}):")
        
        for i, col in enumerate(data['columns'], 1):
            # Show sample values for analysis
            sample_values = df[col].dropna().head(3).tolist()
            print(f"     {i:2d}. {col}")
            print(f"         Sample values: {sample_values}")
            
            # Check if this looks like a date column
            if 'date' in col.lower() or any(str(val).isdigit() and len(str(val)) == 5 for val in sample_values):
                print(f"         🗓️  Potential date column!")
                
                # Try to convert and show date range
                if any(str(val).isdigit() and len(str(val)) == 5 for val in sample_values):
                    try:
                        date_samples = [excel_serial_to_date(val) for val in sample_values if pd.notna(val)]
                        if date_samples and any(d for d in date_samples if d):
                            print(f"         📅 Date range: {min(d for d in date_samples if d)} to {max(d for d in date_samples if d)}")
                    except:
                        pass
            
            # Check for numeric columns
            if df[col].dtype in ['int64', 'float64'] or any(str(val).replace('.','').replace('-','').isdigit() for val in sample_values):
                print(f"         🔢 Numeric column")
        
        print(f"\n   📈 Sample rows:")
        print(df.head(2).to_string(max_cols=8, max_colwidth=20))

def main():
    try:
        print("🚀 Accessing new keywords SharePoint sheet...")
        
        # Get SharePoint site
        site_id, access_token = get_sharepoint_site()
        if not site_id:
            print("❌ Could not access SharePoint site")
            return
        
        # Use the file ID from environment variable or direct from URL
        file_id = "EecvZ9lz7j5BhEieh20X8boB897syk_YdkAfffmywq4i7Q"  # From the SharePoint URL
        
        print(f"🎯 Using file ID: {file_id}")
        all_data = access_excel_file(site_id, file_id, access_token)
        
        if not all_data:
            # List all files to see what's available
            print("🔍 Listing all available files...")
            excel_files = list_all_files(site_id, access_token)
            
            if excel_files:
                # Look for the newest keyword-related file
                keyword_files = [f for f in excel_files if 'keyword' in f['name'].lower() or 'amazon' in f['name'].lower()]
                
                if keyword_files:
                    # Use the most recently modified file
                    latest_file = max(keyword_files, key=lambda x: x.get('lastModifiedDateTime', ''))
                    print(f"\n📊 Using most recent keyword file: {latest_file['name']}")
                    all_data = access_excel_file(site_id, latest_file['id'], access_token)
                else:
                    print(f"\n📊 No keyword files found. Using first Excel file: {excel_files[0]['name']}")
                    all_data = access_excel_file(site_id, excel_files[0]['id'], access_token)
            else:
                print("❌ No Excel files found")
                return
        
        if all_data:
            analyze_data_structure(all_data)
            
            print(f"\n{'='*80}")
            print("✅ EXTRACTION COMPLETE")
            print(f"{'='*80}")
            print(f"Successfully extracted {len(all_data)} worksheets:")
            for sheet_name, data in all_data.items():
                print(f"  📋 {sheet_name}: {data['shape'][0]} rows x {data['shape'][1]} columns")
        else:
            print("❌ No data extracted")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()