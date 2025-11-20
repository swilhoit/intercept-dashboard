#!/usr/bin/env python3
"""
Backfill Amazon Ads data from SharePoint version history
Downloads all historical versions and extracts daily snapshots
"""

import requests
import os
import pandas as pd
import io
from datetime import datetime, timedelta
from google.cloud import bigquery
import base64

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

# Amazon Ads files to backfill
FILES_CONFIG = [
    {
        'name': 'Amazon Ads - Conversions & Orders',
        'file_id': '013DC5AD67544C02BD783714D80965FE',
        'share_url': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx',
        'sheet_name': 'Funnel data',
        'table_id': f'{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders'
    },
    {
        'name': 'Amazon Ads - Daily Keywords',
        'file_id': 'BDBC5289A91B4A2291BF21B443C1EE12',
        'share_url': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx',
        'sheet_name': 'Funnel data',
        'table_id': f'{PROJECT_ID}.amazon_ads_sharepoint.daily_keywords'
    }
]

def get_access_token():
    """Get Microsoft Graph access token"""
    tenant_id = os.getenv("MICROSOFT_TENANT_ID")
    client_id = os.getenv("MICROSOFT_CLIENT_ID")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")

    if not all([tenant_id, client_id, client_secret]):
        raise ValueError("Microsoft credentials not configured")

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

def get_file_versions(share_url, access_token):
    """Get all versions of a SharePoint file"""
    try:
        base64_value = base64.b64encode(share_url.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        # Get shared item metadata
        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        shared_response = requests.get(shared_item_url, headers=headers)
        shared_response.raise_for_status()

        shared_item = shared_response.json()
        drive_id = shared_item['parentReference']['driveId']
        item_id = shared_item['id']

        # Get versions
        versions_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions"
        versions_response = requests.get(versions_url, headers=headers)
        versions_response.raise_for_status()

        versions = versions_response.json().get('value', [])

        # Parse version dates
        version_list = []
        for version in versions:
            if 'lastModifiedDateTime' in version:
                version_date = datetime.fromisoformat(version['lastModifiedDateTime'].replace('Z', '+00:00'))
                version_list.append({
                    'id': version['id'],
                    'date': version_date,
                    'drive_id': drive_id,
                    'item_id': item_id
                })

        version_list.sort(key=lambda x: x['date'])
        return version_list

    except Exception as e:
        print(f"❌ Error getting versions: {e}")
        raise

def download_file_version(drive_id, item_id, version_id, access_token):
    """Download specific version of a file"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}
        version_content_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/versions/{version_id}/content"

        content_response = requests.get(version_content_url, headers=headers)
        content_response.raise_for_status()

        return content_response.content
    except Exception as e:
        print(f"  ⚠️  Error downloading version: {e}")
        return None

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper date"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        excel_epoch = datetime(1899, 12, 30)
        return (excel_epoch + timedelta(days=int(float(serial_date)))).date()
    except (ValueError, TypeError):
        try:
            return pd.to_datetime(serial_date).date()
        except:
            return None

def parse_excel_data(content, sheet_name):
    """Parse Excel file content into DataFrame"""
    try:
        excel_file = io.BytesIO(content)
        df = pd.read_excel(excel_file, sheet_name=sheet_name)

        # Handle date conversion
        if 'Date' in df.columns:
            df['date'] = df['Date'].apply(excel_serial_to_date)
            df = df.drop('Date', axis=1)
            df = df.dropna(subset=['date'])

        # Standardize column names
        column_mapping = {
            'Cost (*)': 'cost',
            'Clicks': 'clicks',
            'Impressions': 'impressions',
            'Campaign Name': 'campaign_name',
            'Campaign ID': 'campaign_id',
            'Ad Group Name': 'ad_group_name',
            'Ad Group ID': 'ad_group_id',
            'Portfolio Name': 'portfolio_name',
            'Campaign Status': 'campaign_status',
            'Search Term': 'search_term',
            'Keyword ID': 'keyword_id',
            'Keyword Text': 'keyword_text',
            'Match Type': 'match_type',
            'Targeting': 'keyword_text',
            '1 Day Advertised SKU Conversions': 'conversions_1d_sku',
            '1 Day Total Conversions': 'conversions_1d_total',
            '7 Day Advertised SKU Conversions': 'conversions_7d_sku',
            '7 Day Total Conversions': 'conversions_7d_total',
            '14 Day Advertised SKU Conversions': 'conversions_14d_sku',
            '14 Day Total Conversions': 'conversions_14d_total',
            '30 Day Advertised SKU Conversions': 'conversions_30d_sku',
            '30 Day Total Conversions': 'conversions_30d_total',
            '1 Day Advertised SKU Units': 'units_1d_sku',
            '1 Day Total Units': 'units_1d_total',
            '7 Day Advertised SKU Units': 'units_7d_sku',
            '7 Day Total Units': 'units_7d_total',
            '14 Day Advertised SKU Units': 'units_14d_sku',
            '14 Day Total Units': 'units_14d_total',
            '30 Day Advertised SKU Units': 'units_30d_sku',
            '30 Day Total Units': 'units_30d_total',
            '1 Day Advertised SKU Sales (*)': 'sales_1d_sku',
            '1 Day Total Sales (*)': 'sales_1d_total',
            '7 Day Advertised SKU Sales (*)': 'sales_7d_sku',
            '7 Day Total Sales (*)': 'sales_7d_total',
            '14 Day Advertised SKU Sales (*)': 'sales_14d_sku',
            '14 Day Total Sales (*)': 'sales_14d_total',
            '30 Day Advertised SKU Sales (*)': 'sales_30d_sku',
            '30 Day Total Sales (*)': 'sales_30d_total',
        }

        df = df.rename(columns=column_mapping)

        # Keep only schema columns
        schema_columns = [
            'date', 'cost', 'clicks', 'impressions',
            'campaign_id', 'campaign_name', 'campaign_status',
            'ad_group_id', 'ad_group_name', 'portfolio_name',
            'search_term', 'keyword_id', 'keyword_text', 'match_type',
            'conversions_1d_sku', 'conversions_1d_total',
            'conversions_7d_sku', 'conversions_7d_total',
            'conversions_14d_sku', 'conversions_14d_total',
            'conversions_30d_sku', 'conversions_30d_total',
            'units_1d_sku', 'units_1d_total',
            'units_7d_sku', 'units_7d_total',
            'units_14d_sku', 'units_14d_total',
            'units_30d_sku', 'units_30d_total',
            'sales_1d_sku', 'sales_1d_total',
            'sales_7d_sku', 'sales_7d_total',
            'sales_14d_sku', 'sales_14d_total',
            'sales_30d_sku', 'sales_30d_total',
        ]

        df = df[[col for col in schema_columns if col in df.columns]]

        # Convert numeric columns
        numeric_cols = ['cost', 'clicks', 'impressions'] + [col for col in df.columns if col.startswith(('conversions_', 'units_', 'sales_'))]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # Fill NaN for string columns
        string_cols = ['campaign_name', 'ad_group_name', 'portfolio_name', 'campaign_status', 'search_term', 'keyword_text', 'match_type']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('')

        # Fill NaN for ID columns
        id_cols = ['campaign_id', 'ad_group_id', 'keyword_id']
        for col in id_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int64')

        return df

    except Exception as e:
        print(f"  ⚠️  Error parsing Excel: {e}")
        return None

def upload_to_bigquery_batch(all_data, table_id):
    """Upload all collected data to BigQuery"""
    try:
        if all_data is None or (isinstance(all_data, pd.DataFrame) and all_data.empty):
            print("  ⚠️  No data to upload")
            return False

        client = bigquery.Client(project=PROJECT_ID)

        # Convert to records
        records = all_data.to_dict('records')
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif hasattr(value, 'isoformat'):
                    record[key] = value.isoformat()

        dataset_id, table_name = table_id.split('.')[-2:]
        table_ref = client.dataset(dataset_id).table(table_name)

        # Delete old data
        try:
            delete_query = f"DELETE FROM `{table_id}` WHERE TRUE"
            client.query(delete_query).result()
            print(f"  🗑️  Cleared old data from {table_name}")
        except Exception as e:
            print(f"  ⚠️  Could not delete old data: {e}")

        # Insert in batches of 10,000
        batch_size = 10000
        total_inserted = 0

        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            errors = client.insert_rows_json(table_ref, batch, row_ids=[None] * len(batch))

            if errors:
                print(f"  ⚠️  Insert errors in batch {i//batch_size + 1}: {errors[:3]}")
            else:
                total_inserted += len(batch)
                print(f"  ✅ Inserted batch {i//batch_size + 1}: {len(batch)} rows")

        print(f"  ✅ Total uploaded: {total_inserted} rows to {table_name}")
        return True

    except Exception as e:
        print(f"  ❌ Error uploading to BigQuery: {e}")
        return False

def backfill_file(file_config, access_token):
    """Backfill data for one file"""
    print(f"\n{'='*80}")
    print(f"📄 {file_config['name']}")
    print(f"{'='*80}")

    # Get all versions
    print("  📥 Fetching version history...")
    versions = get_file_versions(file_config['share_url'], access_token)
    print(f"  ✅ Found {len(versions)} versions")

    if not versions:
        print("  ❌ No versions available")
        return False

    # Show date range
    earliest = versions[0]['date']
    latest = versions[-1]['date']
    print(f"  📅 Version range: {earliest.strftime('%Y-%m-%d')} to {latest.strftime('%Y-%m-%d')}")

    # Collect all data from all versions
    all_dataframes = []
    successful_versions = 0

    print(f"\n  🔄 Processing {len(versions)} versions...")

    for i, version in enumerate(versions):
        version_date = version['date'].strftime('%Y-%m-%d')

        # Download version
        content = download_file_version(
            version['drive_id'],
            version['item_id'],
            version['id'],
            access_token
        )

        if content:
            # Parse data
            df = parse_excel_data(content, file_config['sheet_name'])

            if df is not None and len(df) > 0:
                all_dataframes.append(df)
                successful_versions += 1

                if (i + 1) % 10 == 0:
                    print(f"    Progress: {i + 1}/{len(versions)} versions processed")

        # Small delay to avoid rate limiting
        if (i + 1) % 5 == 0:
            import time
            time.sleep(0.5)

    print(f"  ✅ Successfully processed {successful_versions}/{len(versions)} versions")

    if not all_dataframes:
        print("  ❌ No data extracted from versions")
        return False

    # Combine all data
    print(f"\n  🔗 Combining data from all versions...")
    combined_df = pd.concat(all_dataframes, ignore_index=True)

    # Remove duplicates (keep latest version of each date/campaign combination)
    print(f"  📊 Total rows before deduplication: {len(combined_df)}")

    dedup_cols = ['date', 'campaign_id', 'ad_group_id']
    if 'keyword_id' in combined_df.columns:
        dedup_cols.append('keyword_id')

    combined_df = combined_df.drop_duplicates(subset=dedup_cols, keep='last')
    print(f"  📊 Total rows after deduplication: {len(combined_df)}")

    # Show date range in data
    if not combined_df.empty:
        date_min = combined_df['date'].min()
        date_max = combined_df['date'].max()
        unique_dates = combined_df['date'].nunique()
        print(f"  📅 Data date range: {date_min} to {date_max}")
        print(f"  📆 Unique dates: {unique_dates}")

    # Upload to BigQuery
    print(f"\n  ☁️  Uploading to BigQuery...")
    success = upload_to_bigquery_batch(combined_df, file_config['table_id'])

    return success

def update_master_ads_table():
    """Update MASTER.TOTAL_DAILY_ADS from backfilled data"""
    try:
        print(f"\n{'='*80}")
        print("🎯 Updating MASTER.TOTAL_DAILY_ADS")
        print(f"{'='*80}")

        client = bigquery.Client(project=PROJECT_ID)

        query = f"""
        CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS` AS
        WITH amazon_daily AS (
          SELECT
            CAST(date AS DATE) as date,
            SUM(cost) as amazon_ads_spend,
            SUM(clicks) as amazon_ads_clicks,
            SUM(impressions) as amazon_ads_impressions,
            SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
            COUNT(DISTINCT campaign_id) as amazon_campaigns
          FROM (
            SELECT date, cost, clicks, impressions, conversions_1d_total, campaign_id
            FROM `{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders`
            WHERE date IS NOT NULL
            UNION ALL
            SELECT date, cost, clicks, impressions, conversions_1d_total, campaign_id
            FROM `{PROJECT_ID}.amazon_ads_sharepoint.daily_keywords`
            WHERE date IS NOT NULL
          )
          WHERE clicks > 0 OR impressions > 0 OR cost > 0
          GROUP BY CAST(date AS DATE)
        )
        SELECT
          date,
          amazon_ads_spend,
          amazon_ads_clicks,
          amazon_ads_impressions,
          amazon_ads_conversions,
          amazon_campaigns,
          0.0 as google_ads_spend,
          0 as google_ads_clicks,
          0 as google_ads_impressions,
          amazon_ads_spend as total_spend,
          amazon_ads_clicks as total_clicks,
          amazon_ads_impressions as total_impressions,
          amazon_ads_conversions as total_conversions,
          CURRENT_TIMESTAMP() as created_at
        FROM amazon_daily
        ORDER BY date DESC
        """

        client.query(query).result()

        # Verify
        verify_query = f"""
        SELECT
            MIN(date) as earliest,
            MAX(date) as latest,
            COUNT(DISTINCT date) as total_days,
            SUM(amazon_ads_spend) as total_spend,
            SUM(amazon_ads_conversions) as total_conversions
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS`
        """

        result = list(client.query(verify_query).result())[0]

        print(f"  ✅ MASTER.TOTAL_DAILY_ADS updated")
        print(f"  📅 Date range: {result.earliest} to {result.latest}")
        print(f"  📆 Total days: {result.total_days}")
        print(f"  💰 Total spend: ${result.total_spend:,.2f}")
        print(f"  🎯 Total conversions: {result.total_conversions}")

        return True
    except Exception as e:
        print(f"  ❌ Error updating MASTER: {e}")
        return False

def main():
    """Main backfill process"""
    print("=" * 80)
    print("🚀 AMAZON ADS SHAREPOINT BACKFILL")
    print("=" * 80)
    print(f"Project: {PROJECT_ID}")
    print(f"Files to process: {len(FILES_CONFIG)}")
    print()

    # Load credentials
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

    # Authenticate
    print("🔐 Authenticating with Microsoft Graph...")
    access_token = get_access_token()
    print("✅ Authenticated")

    # Process each file
    results = []
    for file_config in FILES_CONFIG:
        success = backfill_file(file_config, access_token)
        results.append({
            'name': file_config['name'],
            'success': success
        })

    # Update MASTER table
    master_success = update_master_ads_table()

    # Summary
    print(f"\n{'='*80}")
    print("📊 BACKFILL SUMMARY")
    print(f"{'='*80}")

    for result in results:
        status = "✅" if result['success'] else "❌"
        print(f"{status} {result['name']}")

    print(f"\n{'✅' if master_success else '❌'} MASTER table update")

    successful = sum(1 for r in results if r['success'])
    print(f"\n✅ {successful}/{len(results)} files successfully backfilled")
    print(f"{'✅' if master_success else '❌'} MASTER.TOTAL_DAILY_ADS updated")
    print("=" * 80)

if __name__ == "__main__":
    main()
