#!/usr/bin/env python3
"""
Find and list SharePoint files to identify the Amazon ads Excel file
"""

import os
import requests
import json

# Microsoft Graph API endpoints
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
AUTH_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

def authenticate():
    """Get access token using client credentials flow"""
    tenant_id = os.getenv("MICROSOFT_TENANT_ID")
    client_id = os.getenv("MICROSOFT_CLIENT_ID")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")
    
    auth_url = AUTH_URL.format(tenant_id=tenant_id)
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://graph.microsoft.com/.default'
    }
    
    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()
    
    token_data = response.json()
    return token_data['access_token']

def list_onedrive_files(access_token):
    """List files in OneDrive"""
    url = f"{GRAPH_BASE_URL}/me/drive/root/children"
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()['value']
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return []

def search_files(access_token, query):
    """Search for files"""
    url = f"{GRAPH_BASE_URL}/me/drive/root/search(q='{query}')"
    headers = {'Authorization': f'Bearer {access_token}'}
    
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()['value']
    else:
        print(f"Error searching: {response.status_code} - {response.text}")
        return []

def main():
    try:
        print("🔐 Authenticating...")
        access_token = authenticate()
        print("✅ Authenticated!")
        
        print("\n📂 Searching for Excel files...")
        excel_files = search_files(access_token, "*.xlsx")
        
        if excel_files:
            print(f"Found {len(excel_files)} Excel files:")
            for i, file in enumerate(excel_files):
                print(f"{i+1}. {file['name']}")
                print(f"   ID: {file['id']}")
                print(f"   Size: {file.get('size', 'Unknown')} bytes")
                print(f"   Modified: {file.get('lastModifiedDateTime', 'Unknown')}")
                if 'amazon' in file['name'].lower() or 'ads' in file['name'].lower():
                    print(f"   🎯 This looks like an Amazon ads file!")
                print()
        
        print("\n🔍 Searching specifically for 'amazon' files...")
        amazon_files = search_files(access_token, "amazon")
        
        if amazon_files:
            print(f"Found {len(amazon_files)} files with 'amazon':")
            for file in amazon_files:
                print(f"- {file['name']} (ID: {file['id']})")
                
        print("\n🔍 Searching specifically for 'ads' files...")
        ads_files = search_files(access_token, "ads")
        
        if ads_files:
            print(f"Found {len(ads_files)} files with 'ads':")
            for file in ads_files:
                print(f"- {file['name']} (ID: {file['id']})")
        
        # Also try to list recent files
        print("\n📅 Listing recent files...")
        recent_url = f"{GRAPH_BASE_URL}/me/drive/recent"
        headers = {'Authorization': f'Bearer {access_token}'}
        
        response = requests.get(recent_url, headers=headers)
        if response.status_code == 200:
            recent_files = response.json()['value']
            excel_recent = [f for f in recent_files if f['name'].endswith(('.xlsx', '.xls'))]
            
            print(f"Found {len(excel_recent)} recent Excel files:")
            for file in excel_recent[:10]:  # Show top 10
                print(f"- {file['name']} (Modified: {file.get('lastModifiedDateTime', 'Unknown')})")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()