#!/usr/bin/env python3
"""
Check FULL SharePoint version history to determine maximum backfill potential
"""

import requests
import os
from datetime import datetime

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

def get_all_file_versions(file_id, access_token):
    """Get ALL version history for a SharePoint file"""

    file_urls = {
        'CC188F9ABEE74538B3DF5577A3A500D8': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx',
        '013DC5AD67544C02BD783714D80965FE': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'BDBC5289A91B4A2291BF21B443C1EE12': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx'
    }

    share_url = file_urls.get(file_id)
    if not share_url:
        return None

    try:
        import base64
        base64_value = base64.b64encode(share_url.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        shared_response = requests.get(shared_item_url, headers=headers)
        shared_response.raise_for_status()

        shared_item = shared_response.json()
        drive_id = shared_item['parentReference']['driveId']
        item_id = shared_item['id']

        versions_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions"
        versions_response = requests.get(versions_url, headers=headers)

        if versions_response.status_code == 200:
            versions_data = versions_response.json()
            return {
                'file_name': shared_item.get('name', 'Unknown'),
                'current_modified': shared_item.get('lastModifiedDateTime'),
                'versions': versions_data.get('value', [])
            }
        return None

    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    """Check FULL version history for all Amazon Ads files"""
    print("=" * 80)
    print("📋 FULL SharePoint Version History Analysis")
    print("=" * 80)

    # Load credentials
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

    files_to_check = {
        'Amazon Ads - Main': 'CC188F9ABEE74538B3DF5577A3A500D8',
        'Amazon Ads - Conversions & Orders': '013DC5AD67544C02BD783714D80965FE',
        'Amazon Ads - Daily Keywords': 'BDBC5289A91B4A2291BF21B443C1EE12'
    }

    for file_name, file_id in files_to_check.items():
        print(f"\n📄 {file_name}")
        print("-" * 80)

        file_info = get_all_file_versions(file_id, access_token)

        if file_info:
            versions = file_info.get('versions', [])
            print(f"📈 Total versions available: {len(versions)}")

            if versions:
                # Extract all version dates
                version_dates = []
                for version in versions:
                    if 'lastModifiedDateTime' in version:
                        version_date = datetime.fromisoformat(version['lastModifiedDateTime'].replace('Z', '+00:00'))
                        version_dates.append(version_date)

                if version_dates:
                    version_dates.sort()
                    earliest = version_dates[0]
                    latest = version_dates[-1]
                    total_days = (latest - earliest).days + 1

                    print(f"📅 Date Range: {earliest.strftime('%Y-%m-%d')} to {latest.strftime('%Y-%m-%d')}")
                    print(f"⏱️  Total Span: {total_days} days")
                    print(f"📊 Versions Available: {len(version_dates)}")

                    # Calculate unique days
                    unique_days = len(set(d.date() for d in version_dates))
                    print(f"📆 Unique Days with Updates: {unique_days}")

                    # Show oldest 5 and newest 5 versions
                    print(f"\n   Oldest 5 versions:")
                    for i, date in enumerate(version_dates[:5]):
                        print(f"      {i+1}. {date.strftime('%Y-%m-%d %H:%M UTC')}")

                    print(f"\n   Newest 5 versions:")
                    for i, date in enumerate(version_dates[-5:]):
                        print(f"      {i+1}. {date.strftime('%Y-%m-%d %H:%M UTC')}")

                    # Backfill assessment
                    print(f"\n✅ BACKFILL POTENTIAL:")
                    print(f"   Can reconstruct up to {unique_days} days of historical data")
                    print(f"   Going back to: {earliest.strftime('%Y-%m-%d')}")

                    # Compare to current BigQuery data
                    from datetime import date
                    bq_start = date(2025, 10, 15)  # From earlier query
                    earliest_sharepoint = earliest.date()

                    if earliest_sharepoint < bq_start:
                        days_before_bq = (bq_start - earliest_sharepoint).days
                        print(f"   🎯 Can add {days_before_bq} MORE days before current BigQuery data!")
                        print(f"      Current BQ: Oct 15, 2025 onwards")
                        print(f"      SharePoint: {earliest_sharepoint} onwards")
                    else:
                        print(f"   ⚠️  SharePoint versions start AFTER current BigQuery data")

    print("\n" + "=" * 80)
    print("✅ Analysis Complete")
    print("=" * 80)

if __name__ == "__main__":
    main()
