#!/usr/bin/env python3
"""
Direct Excel file access using SharePoint Graph API with specific file path
"""

import os
import requests
import pandas as pd
import base64
import json
from urllib.parse import quote

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
    
    # Try different approaches to access the SharePoint site
    hostname = "tetrahedronglobal-my.sharepoint.com"
    site_path = "/personal/swilhoit_tetrahedronglobal_onmicrosoft_com"
    
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Method 1: Direct site access
    url = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{site_path}"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        site_info = response.json()
        print(f"✅ Got site info: {site_info['displayName']}")
        return site_info['id'], access_token
    else:
        print(f"Site access failed: {response.status_code} - {response.text}")
        
        # Method 2: Search for sites
        search_url = "https://graph.microsoft.com/v1.0/sites?search=tetrahedron"
        response = requests.get(search_url, headers=headers)
        
        if response.status_code == 200:
            sites = response.json()['value']
            print(f"Found {len(sites)} sites:")
            for site in sites:
                print(f"- {site['displayName']} (ID: {site['id']})")
                if 'swilhoit' in site['webUrl'].lower():
                    print(f"  🎯 This looks like your personal site!")
                    return site['id'], access_token
        
    return None, access_token

def list_drive_files(site_id, access_token):
    """List files in the drive"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Try to get drive items
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/children"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        files = response.json()['value']
        print(f"Found {len(files)} files in drive:")
        
        excel_files = []
        for file in files:
            print(f"- {file['name']}")
            if file['name'].endswith(('.xlsx', '.xls')):
                excel_files.append(file)
                print(f"  📊 Excel file! ID: {file['id']}")
        
        return excel_files
    else:
        print(f"Error listing files: {response.status_code} - {response.text}")
        return []

def access_excel_directly(site_id, file_id, access_token):
    """Access Excel file directly with site ID and file ID"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    # Get file info first using site-based access
    url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        file_info = response.json()
        print(f"✅ Found file: {file_info['name']}")
        
        # Try to get workbook using site-based access
        workbook_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}/workbook/worksheets"
        response = requests.get(workbook_url, headers=headers)
        
        if response.status_code == 200:
            worksheets = response.json()['value']
            print(f"Found {len(worksheets)} worksheets:")
            for sheet in worksheets:
                print(f"- {sheet['name']}")
            
            # Get data from first worksheet
            if worksheets:
                sheet_name = worksheets[0]['name']
                data_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{file_id}/workbook/worksheets('{sheet_name}')/usedRange"
                response = requests.get(data_url, headers=headers)
                
                if response.status_code == 200:
                    range_data = response.json()
                    values = range_data['values']
                    
                    if values:
                        # Convert to DataFrame
                        df = pd.DataFrame(values[1:], columns=values[0])
                        print(f"✅ Extracted {len(df)} rows of data!")
                        print(f"Columns: {list(df.columns)}")
                        
                        # Save and return
                        filename = f"{file_info['name'].replace('.xlsx', '')}_data.csv"
                        df.to_csv(filename, index=False)
                        print(f"💾 Saved to {filename}")
                        return df, file_info['name']
                    
        else:
            print(f"Workbook access failed: {response.status_code} - {response.text}")
    else:
        print(f"File access failed: {response.status_code} - {response.text}")
    
    return None, None

def main():
    try:
        print("🚀 Starting direct Excel access...")
        access_token = authenticate()
        
        print("\n🔍 Getting SharePoint site...")
        site_id, access_token = get_sharepoint_site()
        
        if site_id:
            excel_files = list_drive_files(site_id, access_token)
            
            if excel_files:
                print(f"\n📊 Found {len(excel_files)} Excel files. Processing each one...\n")
                
                all_data = []
                for i, excel_file in enumerate(excel_files):
                    print(f"{'='*50}")
                    print(f"Processing file {i+1}/{len(excel_files)}: {excel_file['name']}")
                    print(f"{'='*50}")
                    
                    df, filename = access_excel_directly(site_id, excel_file['id'], access_token)
                    
                    if df is not None:
                        print(f"✅ SUCCESS! Got {len(df)} rows with {len(df.columns)} columns")
                        print("Column names:")
                        for j, col in enumerate(df.columns, 1):
                            print(f"  {j}. {col}")
                        
                        # Check for date columns
                        date_cols = [col for col in df.columns if 'date' in col.lower()]
                        if date_cols:
                            print(f"\n📅 Found date columns: {date_cols}")
                            for col in date_cols:
                                try:
                                    df[col] = pd.to_datetime(df[col])
                                    print(f"   Date range in {col}: {df[col].min()} to {df[col].max()}")
                                except:
                                    print(f"   Could not parse {col} as dates")
                        
                        # Store file info
                        all_data.append({
                            'filename': filename,
                            'dataframe': df,
                            'shape': df.shape,
                            'columns': list(df.columns)
                        })
                        print(f"✅ Data saved and cataloged!\n")
                    else:
                        print(f"❌ Could not access {excel_file['name']}\n")
                
                # Summary
                print(f"\n{'='*60}")
                print("SUMMARY - Successfully extracted data from:")
                print(f"{'='*60}")
                for data in all_data:
                    print(f"📊 {data['filename']}: {data['shape'][0]} rows x {data['shape'][1]} columns")
                    print(f"   Columns: {', '.join(data['columns'][:5])}{'...' if len(data['columns']) > 5 else ''}")
                    print()
                
                return all_data
            else:
                print("❌ No Excel files found")
        else:
            print("❌ Could not get SharePoint site ID")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        
    return []

if __name__ == "__main__":
    main()