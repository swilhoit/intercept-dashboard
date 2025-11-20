#!/usr/bin/env python3
"""
Check SharePoint document version history
Uses Microsoft Graph API to view file versions and modification history
"""

import requests
import json
import os
from datetime import datetime, timedelta

def get_graph_access_token():
    """Get Microsoft Graph access token"""
    tenant_id = os.getenv("MICROSOFT_TENANT_ID")
    client_id = os.getenv("MICROSOFT_CLIENT_ID")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")

    if not all([tenant_id, client_id, client_secret]):
        print("❌ Microsoft credentials not found in environment")
        return None

    auth_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://graph.microsoft.com/.default'
    }

    try:
        response = requests.post(auth_url, headers=headers, data=data)
        response.raise_for_status()
        return response.json()['access_token']
    except Exception as e:
        print(f"❌ Error getting access token: {e}")
        return None

def get_file_versions(file_id, access_token):
    """Get version history for a SharePoint file"""

    # Map of our Amazon ads file IDs
    file_urls = {
        'CC188F9ABEE74538B3DF5577A3A500D8': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx',
        '013DC5AD67544C02BD783714D80965FE': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'BDBC5289A91B4A2291BF21B443C1EE12': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx'
    }

    share_url = file_urls.get(file_id)
    if not share_url:
        print(f"❌ Unknown file ID: {file_id}")
        return None

    try:
        # Encode the share URL for the API
        import base64
        base64_value = base64.b64encode(share_url.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        # Get the shared item first
        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        shared_response = requests.get(shared_item_url, headers=headers)
        shared_response.raise_for_status()

        shared_item = shared_response.json()
        drive_id = shared_item['parentReference']['driveId']
        item_id = shared_item['id']

        # Get file versions
        versions_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions"
        versions_response = requests.get(versions_url, headers=headers)

        if versions_response.status_code == 200:
            versions_data = versions_response.json()
            return {
                'file_name': shared_item.get('name', 'Unknown'),
                'current_modified': shared_item.get('lastModifiedDateTime'),
                'current_size': shared_item.get('size'),
                'versions': versions_data.get('value', [])
            }
        else:
            print(f"⚠️  Versions API returned {versions_response.status_code}: {versions_response.text}")
            # Return basic file info even if versions fail
            return {
                'file_name': shared_item.get('name', 'Unknown'),
                'current_modified': shared_item.get('lastModifiedDateTime'),
                'current_size': shared_item.get('size'),
                'versions': [],
                'note': 'Version history may require additional permissions'
            }

    except Exception as e:
        print(f"❌ Error getting file versions: {e}")
        return None

def download_version_data(file_id, version_id, access_token):
    """Download data from a specific version of a SharePoint file"""

    # Map of our Amazon ads file IDs
    file_urls = {
        'CC188F9ABEE74538B3DF5577A3A500D8': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx',
        '013DC5AD67544C02BD783714D80965FE': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'BDBC5289A91B4A2291BF21B443C1EE12': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx'
    }

    share_url = file_urls.get(file_id)
    if not share_url:
        print(f"❌ Unknown file ID: {file_id}")
        return None

    try:
        # Encode the share URL for the API
        import base64
        base64_value = base64.b64encode(share_url.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        # Get the shared item first
        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        shared_response = requests.get(shared_item_url, headers=headers)
        shared_response.raise_for_status()

        shared_item = shared_response.json()
        drive_id = shared_item['parentReference']['driveId']
        item_id = shared_item['id']

        # Download specific version content
        version_content_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions/{version_id}/content"
        content_response = requests.get(version_content_url, headers=headers)

        if content_response.status_code == 200:
            return content_response.content
        else:
            print(f"⚠️  Could not download version {version_id}: {content_response.status_code}")
            return None

    except Exception as e:
        print(f"❌ Error downloading version: {e}")
        return None

def analyze_historical_data(file_id, access_token, days_back=30):
    """Analyze historical data from SharePoint versions"""

    file_info = get_file_versions(file_id, access_token)
    if not file_info:
        return None

    versions = file_info.get('versions', [])
    if not versions:
        print("❌ No version history available")
        return None

    print(f"📊 Analyzing {len(versions)} versions for historical data extraction")

    # Get versions from the last X days
    import pytz
    cutoff_date = datetime.now(pytz.UTC) - timedelta(days=days_back)
    recent_versions = []

    for version in versions:
        if 'lastModifiedDateTime' in version:
            version_date = datetime.fromisoformat(version['lastModifiedDateTime'].replace('Z', '+00:00'))
            if version_date >= cutoff_date:
                recent_versions.append({
                    'id': version['id'],
                    'date': version_date,
                    'size': version.get('size', 0)
                })

    recent_versions.sort(key=lambda x: x['date'])

    print(f"📈 Found {len(recent_versions)} versions in the last {days_back} days")

    # Show version dates to understand the pattern
    for i, version in enumerate(recent_versions[-10:]):  # Show last 10
        print(f"   Version {i+1}: {version['date'].strftime('%Y-%m-%d %H:%M UTC')} ({version['size']} bytes)")

    return recent_versions

def main():
    """Check SharePoint document history for Amazon ads files"""
    print("📋 SharePoint Document History Checker")
    print("=" * 50)

    # Load credentials from .env.local
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

    access_token = get_graph_access_token()
    if not access_token:
        return

    print("✅ Successfully authenticated with Microsoft Graph")
    print()

    # Amazon ads file IDs
    files_to_check = {
        'Amazon Ads - Main': 'CC188F9ABEE74538B3DF5577A3A500D8',
        'Amazon Ads - Conversions & Orders': '013DC5AD67544C02BD783714D80965FE',
        'Amazon Ads - Daily Keywords': 'BDBC5289A91B4A2291BF21B443C1EE12'
    }

    for file_name, file_id in files_to_check.items():
        print(f"📄 {file_name}")
        print("-" * 40)

        file_info = get_file_versions(file_id, access_token)

        if file_info:
            print(f"📁 File: {file_info['file_name']}")

            if file_info.get('current_modified'):
                modified_date = datetime.fromisoformat(file_info['current_modified'].replace('Z', '+00:00'))
                print(f"📅 Last Modified: {modified_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")

                # Check if it's recent
                days_old = (datetime.now(modified_date.tzinfo) - modified_date).days
                if days_old == 0:
                    print(f"✅ Updated today!")
                elif days_old == 1:
                    print(f"⚠️  Updated yesterday ({days_old} day ago)")
                elif days_old <= 7:
                    print(f"⚠️  Updated {days_old} days ago")
                else:
                    print(f"❌ Updated {days_old} days ago (stale)")

            if file_info.get('current_size'):
                size_kb = file_info['current_size'] / 1024
                print(f"📊 Size: {size_kb:.1f} KB")

            versions = file_info.get('versions', [])
            if versions:
                print(f"📈 Version History: {len(versions)} versions available")
                print("   Recent versions:")
                for i, version in enumerate(versions[:5]):  # Show latest 5 versions
                    if 'lastModifiedDateTime' in version:
                        version_date = datetime.fromisoformat(version['lastModifiedDateTime'].replace('Z', '+00:00'))
                        print(f"   v{len(versions)-i}: {version_date.strftime('%Y-%m-%d %H:%M UTC')}")

                # Analyze historical data potential
                print("\n🔍 Historical Data Analysis:")
                historical_versions = analyze_historical_data(file_id, access_token, days_back=30)

                if historical_versions and len(historical_versions) > 1:
                    # Check if we have daily updates
                    daily_versions = []
                    last_date = None

                    for version in historical_versions:
                        version_date = version['date'].date()
                        if last_date != version_date:
                            daily_versions.append(version)
                            last_date = version_date

                    print(f"📅 Potential daily data points: {len(daily_versions)}")

                    if len(daily_versions) >= 7:
                        print("✅ Sufficient historical versions for daily backfill!")
                        print("   We can potentially reconstruct daily data going back 30+ days")
                    else:
                        print("⚠️  Limited historical versions for backfill")
            else:
                print("📈 Version History: Not available or no permissions")
                if file_info.get('note'):
                    print(f"   Note: {file_info['note']}")
        else:
            print(f"❌ Could not access file information")

        print()

if __name__ == "__main__":
    main()