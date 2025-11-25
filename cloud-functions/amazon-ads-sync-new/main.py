#!/usr/bin/env python3
"""
Cloud Function: Amazon Ads SharePoint Sync
Fetches Amazon Ads Excel files from SharePoint and uploads to BigQuery
Uses same authentication as Amazon Orders sync
"""

import os
import requests
import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import functions_framework
import io
import base64

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
TENANT_ID = os.environ.get('MICROSOFT_TENANT_ID')
CLIENT_ID = os.environ.get('MICROSOFT_CLIENT_ID')
CLIENT_SECRET = os.environ.get('MICROSOFT_CLIENT_SECRET')

# Amazon Ads files from SharePoint (using direct file IDs)
FILES_TO_SYNC = [
    {
        'name': 'Amazon Ads - Conversions & Orders',
        'file_id': '013DC5AD-6754-4C02-BD78-3714D80965FE',
        'table_id': f'{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders',
        'sheet_name': 'Funnel data'
    },
    {
        'name': 'Amazon Ads - Daily Keywords',
        'file_id': 'BDBC5289-A91B-4A22-91BF-21B443C1EE12',
        'table_id': f'{PROJECT_ID}.amazon_ads_sharepoint.daily_keywords',
        'sheet_name': 'Funnel data'
    },
    {
        'name': 'Amazon Ads - Keywords Report',
        'file_id': 'D9672FE7-EE73-413E-8448-9E876D17F1BA',
        'table_id': f'{PROJECT_ID}.amazon_ads_sharepoint.keywords',
        'sheet_name': 'Funnel data'
    }
]

def get_access_token():
    """Get Microsoft Graph access token"""
    if not all([TENANT_ID, CLIENT_ID, CLIENT_SECRET]):
        raise ValueError("Microsoft credentials not configured")

    auth_url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"

    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope': 'https://graph.microsoft.com/.default'
    }

    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()

    return response.json()['access_token']

def download_excel_by_file_id(file_id, access_token):
    """Download Excel file from SharePoint using direct file ID"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}

        # Get the file metadata and download URL
        file_url = f"https://graph.microsoft.com/v1.0/users/swilhoit@tetrahedronglobal.onmicrosoft.com/drive/items/{file_id}"
        response = requests.get(file_url, headers=headers)
        response.raise_for_status()

        file_info = response.json()
        download_url = file_info.get('@microsoft.graph.downloadUrl')

        if not download_url:
            raise ValueError("No download URL found")

        # Download the file content
        file_response = requests.get(download_url)
        file_response.raise_for_status()

        return file_response.content

    except Exception as e:
        print(f"Error downloading file: {e}")
        raise

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

        print(f"Parsed {len(df)} rows from sheet '{sheet_name}'")

        # Handle date conversion
        if 'Date' in df.columns:
            print("Converting dates...")
            df['date'] = df['Date'].apply(excel_serial_to_date)
            df = df.drop('Date', axis=1)
            df = df.dropna(subset=['date'])

            if not df.empty:
                print(f"Date range: {df['date'].min()} to {df['date'].max()}")

        # Standardize column names for ads data - COMPLETE mapping
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
            # Keyword-specific columns
            'Search Term': 'search_term',
            'Keyword ID': 'keyword_id',
            'Keyword Text': 'keyword_text',
            'Match Type': 'match_type',
            'Targeting': 'keyword_text',  # Alternative name
            # Conversions
            '1 Day Advertised SKU Conversions': 'conversions_1d_sku',
            '1 Day Total Conversions': 'conversions_1d_total',
            '7 Day Advertised SKU Conversions': 'conversions_7d_sku',
            '7 Day Total Conversions': 'conversions_7d_total',
            '14 Day Advertised SKU Conversions': 'conversions_14d_sku',
            '14 Day Total Conversions': 'conversions_14d_total',
            '30 Day Advertised SKU Conversions': 'conversions_30d_sku',
            '30 Day Total Conversions': 'conversions_30d_total',
            # Units
            '1 Day Advertised SKU Units': 'units_1d_sku',
            '1 Day Total Units': 'units_1d_total',
            '7 Day Advertised SKU Units': 'units_7d_sku',
            '7 Day Total Units': 'units_7d_total',
            '14 Day Advertised SKU Units': 'units_14d_sku',
            '14 Day Total Units': 'units_14d_total',
            '30 Day Advertised SKU Units': 'units_30d_sku',
            '30 Day Total Units': 'units_30d_total',
            # Sales
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

        # Keep only columns that exist in the schema
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

        # Filter to only schema columns that exist in df
        df = df[[col for col in schema_columns if col in df.columns]]

        # Convert numeric columns
        numeric_cols = ['cost', 'clicks', 'impressions'] + [col for col in df.columns if col.startswith(('conversions_', 'units_', 'sales_'))]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # Fill NaN values for string columns
        string_cols = ['campaign_name', 'ad_group_name', 'portfolio_name', 'campaign_status', 'search_term', 'keyword_text', 'match_type']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('')

        # Fill NaN values for ID columns
        id_cols = ['campaign_id', 'ad_group_id', 'keyword_id']
        for col in id_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int64')

        print(f"Processed {len(df)} rows successfully")
        return df

    except Exception as e:
        print(f"Error parsing Excel: {e}")
        raise

def upload_to_bigquery(df, table_id):
    """Upload DataFrame to BigQuery"""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Convert dates to strings for JSON serialization
        records = df.to_dict('records')
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif hasattr(value, 'isoformat'):
                    record[key] = value.isoformat()

        dataset_id, table_name = table_id.split('.')[-2:]
        table_ref = client.dataset(dataset_id).table(table_name)

        # Delete old data first
        try:
            delete_query = f"DELETE FROM `{table_id}` WHERE TRUE"
            client.query(delete_query).result()
            print("Deleted old data")
        except Exception as e:
            print(f"Note: Could not delete old data: {e}")

        # Insert new data
        errors = client.insert_rows_json(table_ref, records, row_ids=[None] * len(records))

        if errors:
            raise ValueError(f"Insert errors: {errors}")

        print(f"Uploaded {len(records)} rows to {table_id}")
        return True

    except Exception as e:
        print(f"Error uploading to BigQuery: {e}")
        raise

def update_keywords_enhanced():
    """Rebuild keywords_enhanced table with latest data from all sources"""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        query = f"""
        CREATE OR REPLACE TABLE `{PROJECT_ID}.amazon_ads_sharepoint.keywords_enhanced` AS
        WITH unified_data AS (
          SELECT
            date,
            campaign_id,
            campaign_name,
            campaign_status,
            ad_group_id,
            ad_group_name,
            portfolio_name,
            CAST(keyword_id AS STRING) as keyword_id,
            keyword_text,
            search_term,
            match_type,
            clicks,
            cost,
            impressions,
            conversions_1d_total,
            conversions_1d_sku,
            'keywords' as data_source
          FROM `{PROJECT_ID}.amazon_ads_sharepoint.keywords`
          WHERE date IS NOT NULL

          UNION ALL

          SELECT
            date,
            campaign_id,
            campaign_name,
            campaign_status,
            ad_group_id,
            ad_group_name,
            portfolio_name,
            NULL as keyword_id,
            NULL as keyword_text,
            NULL as search_term,
            NULL as match_type,
            clicks,
            cost,
            impressions,
            conversions_1d_total,
            conversions_1d_sku,
            'conversions_orders' as data_source
          FROM `{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders`
          WHERE date IS NOT NULL

          UNION ALL

          SELECT
            date,
            campaign_id,
            campaign_name,
            campaign_status,
            ad_group_id,
            ad_group_name,
            portfolio_name,
            CAST(keyword_id AS STRING) as keyword_id,
            keyword_text,
            search_term,
            match_type,
            clicks,
            cost,
            impressions,
            conversions_1d_total,
            conversions_1d_sku,
            'daily_keywords' as data_source
          FROM `{PROJECT_ID}.amazon_ads_sharepoint.daily_keywords`
          WHERE date IS NOT NULL
        )
        SELECT
          *,
          CASE WHEN cost > 0 AND clicks > 0 THEN cost / clicks ELSE NULL END as cpc,
          CASE WHEN clicks > 0 AND impressions > 0 THEN (clicks / impressions) * 100 ELSE NULL END as ctr,
          CASE WHEN conversions_1d_total > 0 AND clicks > 0 THEN (conversions_1d_total / clicks) * 100 ELSE NULL END as conversion_rate_1d_total,
          CASE WHEN conversions_1d_sku > 0 AND clicks > 0 THEN (conversions_1d_sku / clicks) * 100 ELSE NULL END as conversion_rate_1d_sku,
          keyword_text IS NOT NULL AND keyword_text != '' as has_keyword_data,
          search_term IS NOT NULL AND search_term != '' as has_search_term,
          (clicks > 0 OR impressions > 0 OR cost > 0) as has_performance,
          EXTRACT(YEAR FROM date) as year,
          EXTRACT(MONTH FROM date) as month,
          EXTRACT(DAY FROM date) as day,
          EXTRACT(DAYOFWEEK FROM date) - 1 as weekday
        FROM unified_data
        ORDER BY date DESC, cost DESC
        """

        client.query(query).result()
        print("Updated keywords_enhanced table")
        return True
    except Exception as e:
        print(f"Error updating keywords_enhanced table: {e}")
        return False

def update_master_ads_table():
    """Update MASTER.TOTAL_DAILY_ADS after syncing ads data"""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        query = f"""
        CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS` AS
        WITH amazon_daily AS (
          -- Use ONLY conversions_orders as the authoritative source to avoid double-counting
          -- The other tables (keywords, daily_keywords) contain overlapping data
          SELECT
            CAST(date AS DATE) as date,
            SUM(cost) as amazon_ads_spend,
            SUM(clicks) as amazon_ads_clicks,
            SUM(impressions) as amazon_ads_impressions,
            SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
            COUNT(DISTINCT campaign_id) as amazon_campaigns
          FROM `{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders`
          WHERE date IS NOT NULL
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
        print("Updated MASTER.TOTAL_DAILY_ADS table")
        return True
    except Exception as e:
        print(f"Error updating MASTER table: {e}")
        return False

@functions_framework.http
def amazon_ads_sync(request):
    """HTTP Cloud Function to sync Amazon Ads from SharePoint to BigQuery"""

    print(f"Starting Amazon Ads SharePoint sync at {datetime.now()}")

    results = []

    try:
        # Get access token
        access_token = get_access_token()
        print("Authenticated with Microsoft Graph")

        # Process each file
        for file_config in FILES_TO_SYNC:
            print(f"\nProcessing: {file_config['name']}")

            try:
                # Download Excel file
                content = download_excel_by_file_id(
                    file_config['file_id'],
                    access_token
                )
                print(f"Downloaded file ({len(content)} bytes)")

                # Parse Excel data
                df = parse_excel_data(content, file_config['sheet_name'])

                # Upload to BigQuery
                upload_to_bigquery(df, file_config['table_id'])

                results.append({
                    'name': file_config['name'],
                    'success': True,
                    'rows_processed': len(df),
                    'table': file_config['table_id']
                })

            except Exception as e:
                print(f"Error processing {file_config['name']}: {e}")
                results.append({
                    'name': file_config['name'],
                    'success': False,
                    'error': str(e)
                })

        # Summary
        success_count = sum(1 for r in results if r['success'])
        total_rows = sum(r.get('rows_processed', 0) for r in results if r['success'])

        # Update keywords_enhanced and MASTER ads table
        keywords_updated = False
        master_updated = False
        if success_count > 0:
            print("\nUpdating keywords_enhanced...")
            keywords_updated = update_keywords_enhanced()

            print("\nUpdating MASTER.TOTAL_DAILY_ADS...")
            master_updated = update_master_ads_table()

        return {
            'status': 'completed',
            'timestamp': datetime.now().isoformat(),
            'files_processed': len(results),
            'successful': success_count,
            'total_rows': total_rows,
            'keywords_updated': keywords_updated,
            'master_updated': master_updated,
            'results': results
        }

    except Exception as e:
        print(f"Fatal error: {e}")
        return {
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }, 500
