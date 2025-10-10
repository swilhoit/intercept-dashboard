#!/usr/bin/env python3
"""
Backfill Amazon Ads Historical Data from SharePoint Versions
Downloads previous versions of Excel files to reconstruct missing daily data
"""

import requests
import json
import os
import sys
from datetime import datetime, timedelta
import pytz
import base64
import tempfile
import pandas as pd
from google.cloud import bigquery

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

    file_urls = {
        'CC188F9ABEE74538B3DF5577A3A500D8': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx',
        '013DC5AD67544C02BD783714D80965FE': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'BDBC5289A91B4A2291BF21B443C1EE12': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx'
    }

    share_url = file_urls.get(file_id)
    if not share_url:
        return None

    try:
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
                'drive_id': drive_id,
                'item_id': item_id,
                'versions': versions_data.get('value', [])
            }
        return None

    except Exception as e:
        print(f"❌ Error getting file versions: {e}")
        return None

def download_version_content(drive_id, item_id, version_id, access_token):
    """Download content from a specific version"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        version_content_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions/{version_id}/content"
        content_response = requests.get(version_content_url, headers=headers)

        if content_response.status_code == 200:
            return content_response.content
        else:
            print(f"⚠️  Could not download version {version_id}: {content_response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error downloading version content: {e}")
        return None

def sanitize_column_name(name):
    """Sanitize column names for BigQuery compatibility"""
    if pd.isna(name) or name is None:
        return 'unnamed_column'

    # Convert to string
    name = str(name)

    # Replace invalid characters and patterns
    name = name.replace('(*)', '_asterisk')
    name = name.replace('(', '_')
    name = name.replace(')', '_')
    name = name.replace(' ', '_')
    name = name.replace('-', '_')
    name = name.replace('+', '_plus')
    name = name.replace('/', '_')
    name = name.replace('\\', '_')
    name = name.replace('%', '_percent')
    name = name.replace('&', '_and')
    name = name.replace('$', '_dollar')
    name = name.replace('#', '_hash')
    name = name.replace('@', '_at')
    name = name.replace('!', '_excl')
    name = name.replace('?', '_quest')
    name = name.replace('*', '_star')
    name = name.replace('^', '_caret')
    name = name.replace('=', '_eq')
    name = name.replace('<', '_lt')
    name = name.replace('>', '_gt')
    name = name.replace('|', '_pipe')
    name = name.replace(';', '_semi')
    name = name.replace(':', '_colon')
    name = name.replace('"', '_quote')
    name = name.replace("'", '_apos')
    name = name.replace(',', '_comma')
    name = name.replace('.', '_dot')

    # Remove multiple underscores
    while '__' in name:
        name = name.replace('__', '_')

    # Remove leading/trailing underscores
    name = name.strip('_')

    # Ensure it doesn't start with a number
    if name and name[0].isdigit():
        name = 'col_' + name

    # Ensure it's not empty
    if not name:
        name = 'unnamed_column'

    return name

def process_excel_version(content, version_date):
    """Process Excel content and extract data with proper date"""
    try:
        # Write content to temporary file
        with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name

        # Read Excel file
        try:
            df = pd.read_excel(temp_file_path, sheet_name='Funnel data')
        except Exception as e:
            print(f"⚠️  Could not read 'Funnel data' sheet: {e}")
            # Try first sheet if Funnel data fails
            df = pd.read_excel(temp_file_path, sheet_name=0)

        # Clean up temp file
        os.unlink(temp_file_path)

        if df.empty:
            return []

        # Sanitize column names for BigQuery
        df.columns = [sanitize_column_name(col) for col in df.columns]

        # Convert Excel date serial numbers to proper dates
        if 'Date' in df.columns:
            # Handle Excel date serial numbers
            def convert_excel_date(value):
                if pd.isna(value):
                    return None
                if isinstance(value, (int, float)) and value > 40000:  # Excel date serial
                    # Excel epoch is 1899-12-30
                    excel_epoch = datetime(1899, 12, 30)
                    return excel_epoch + timedelta(days=value)
                return value

            df['Date'] = df['Date'].apply(convert_excel_date)

        # Add version metadata
        df['version_date'] = version_date
        df['extracted_at'] = datetime.now(pytz.UTC)

        return df.to_dict('records')

    except Exception as e:
        print(f"❌ Error processing Excel content: {e}")
        return []

def upload_to_bigquery(data, table_id):
    """Upload processed data to BigQuery"""
    if not data:
        return False

    try:
        client = bigquery.Client()

        # Convert to DataFrame for easier handling
        df = pd.DataFrame(data)

        # Configure the load job
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
            autodetect=True,
        )

        # Load data
        job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
        job.result()  # Wait for job to complete

        print(f"✅ Loaded {len(data)} rows into {table_id}")
        return True

    except Exception as e:
        print(f"❌ Error loading data to BigQuery: {e}")
        return False

def backfill_historical_data(file_id, table_id, days_back=30):
    """Backfill historical data for a specific file"""

    print(f"\n📥 Backfilling {table_id}")
    print("=" * 60)

    # Load environment
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

    access_token = get_graph_access_token()
    if not access_token:
        return False

    # Get file versions
    file_info = get_file_versions(file_id, access_token)
    if not file_info:
        print("❌ Could not get file versions")
        return False

    versions = file_info['versions']
    print(f"📋 Found {len(versions)} total versions")

    # Filter versions for backfill period
    cutoff_date = datetime.now(pytz.UTC) - timedelta(days=days_back)
    target_versions = []

    for version in versions:
        if 'lastModifiedDateTime' in version:
            version_date = datetime.fromisoformat(version['lastModifiedDateTime'].replace('Z', '+00:00'))
            if version_date >= cutoff_date:
                target_versions.append({
                    'id': version['id'],
                    'date': version_date,
                    'size': version.get('size', 0)
                })

    target_versions.sort(key=lambda x: x['date'])
    print(f"🎯 Processing {len(target_versions)} versions from last {days_back} days")

    successful_loads = 0
    total_rows = 0

    for i, version in enumerate(target_versions):
        print(f"\n📄 Version {i+1}/{len(target_versions)}: {version['date'].strftime('%Y-%m-%d %H:%M UTC')}")

        # Download version content
        content = download_version_content(
            file_info['drive_id'],
            file_info['item_id'],
            version['id'],
            access_token
        )

        if not content:
            print("⚠️  Skipping - could not download")
            continue

        # Process Excel data
        data = process_excel_version(content, version['date'])

        if not data:
            print("⚠️  Skipping - no data extracted")
            continue

        print(f"📊 Extracted {len(data)} rows")

        # Upload to BigQuery
        if upload_to_bigquery(data, table_id):
            successful_loads += 1
            total_rows += len(data)
        else:
            print("⚠️  Failed to upload to BigQuery")

    print(f"\n🎉 Backfill complete!")
    print(f"   ✅ {successful_loads}/{len(target_versions)} versions processed")
    print(f"   📊 {total_rows} total rows loaded")

    return successful_loads > 0

def main():
    """Backfill historical Amazon ads data"""
    print("🔄 Amazon Ads Historical Data Backfill")
    print("=" * 50)

    # Define files to backfill
    files_to_backfill = [
        {
            'name': 'Amazon Ads - Main',
            'file_id': 'CC188F9ABEE74538B3DF5577A3A500D8',
            'table_id': 'intercept-sales-2508061117.amazon_ads_sharepoint.amazon_ads_main_historical'
        },
        {
            'name': 'Amazon Ads - Conversions & Orders',
            'file_id': '013DC5AD67544C02BD783714D80965FE',
            'table_id': 'intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders_historical'
        },
        {
            'name': 'Amazon Ads - Daily Keywords',
            'file_id': 'BDBC5289A91B4A2291BF21B443C1EE12',
            'table_id': 'intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords_historical'
        }
    ]

    # Auto-proceed with backfill
    print("📋 Running backfill for historical data from SharePoint versions:")
    for file_info in files_to_backfill:
        print(f"   • {file_info['name']}")

    days_back = 35  # Go back 35 days to ensure we cover the gap
    print(f"\n🗓️  Going back {days_back} days from today")
    print("🚀 Starting historical backfill process...")

    # Process each file
    results = []
    for file_info in files_to_backfill:
        success = backfill_historical_data(
            file_info['file_id'],
            file_info['table_id'],
            days_back=days_back
        )
        results.append(success)

    # Summary
    successful_files = sum(results)
    print(f"\n🏁 Backfill Summary:")
    print(f"   ✅ {successful_files}/{len(files_to_backfill)} files processed successfully")

    if successful_files > 0:
        print(f"\n💡 Next steps:")
        print(f"   1. Verify data in BigQuery historical tables")
        print(f"   2. Merge historical data with current tables")
        print(f"   3. Update dashboard to show complete timeline")

if __name__ == "__main__":
    main()