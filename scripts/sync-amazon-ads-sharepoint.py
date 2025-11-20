#!/usr/bin/env python3
"""
Automated Amazon Ads SharePoint Sync
Downloads daily Amazon ads data from 3 SharePoint Excel files and imports to BigQuery
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import numpy as np
import requests
import os
import sys
from io import BytesIO

# Configuration
PROJECT_ID = 'intercept-sales-2508061117'
DATASET_ID = 'amazon_ads_sharepoint'

# SharePoint file URLs
SHAREPOINT_FILES = {
    'amazon_ads': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BCC188F9A-BEE7-4538-B3DF-5577A3A500D8%7D&file=amazon%20ads.xlsx&action=default&mobileredirect=true',
    'conversions_orders': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7B013DC5AD-6754-4C02-BD78-3714D80965FE%7D&file=amazon%20ads%20-%20conversions%20%26%20orders.xlsx&action=default&mobileredirect=true',
    'daily_keywords': 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BBDBC5289-A91B-4A22-91BF-21B443C1EE12%7D&file=amazon%20ads%20-%20daily%20keyword%20report.xlsx&action=default&mobileredirect=true'
}

def download_sharepoint_excel(url, filename):
    """Download Excel file from SharePoint"""
    print(f"Downloading {filename} from SharePoint...")

    try:
        # Convert SharePoint view URL to download URL
        if '_layouts/15/Doc.aspx' in url:
            # Extract the sourcedoc parameter and convert to download URL
            import urllib.parse
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qs(parsed.query)

            if 'sourcedoc' in query_params:
                sourcedoc = query_params['sourcedoc'][0].strip('{}')
                # Construct direct download URL
                download_url = f"https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/download.aspx?UniqueId={sourcedoc}"
            else:
                download_url = url
        else:
            download_url = url

        # Note: This will require authentication in production
        # For now, we'll use local files if available
        local_filename = f"{filename}.xlsx"

        if os.path.exists(local_filename):
            print(f"Using local file: {local_filename}")
            return local_filename
        else:
            print(f"Local file not found: {local_filename}")
            print(f"In production, would download from: {download_url}")
            return None

    except Exception as e:
        print(f"Error downloading {filename}: {e}")
        return None

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

def process_amazon_ads_excel(file_path, table_name):
    """Process Amazon ads Excel file and prepare for BigQuery"""
    print(f"\n{'='*60}")
    print(f"Processing: {file_path}")
    print(f"Table: {table_name}")
    print(f"{'='*60}")

    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return None

    try:
        # Read Excel file (try first sheet)
        df = pd.read_excel(file_path, sheet_name=0)

        if df.empty or len(df) == 0:
            print(f"❌ No data in {file_path}")
            return None

        print(f"Original shape: {df.shape}")
        print(f"Original columns: {list(df.columns)}")

        # Handle date conversion
        if 'Date' in df.columns:
            print(f"Converting dates...")
            # Try different date conversion methods
            if df['Date'].dtype == 'object':
                # Try Excel serial number conversion
                df['date'] = df['Date'].apply(excel_serial_to_date)
            else:
                # Try pandas datetime conversion
                df['date'] = pd.to_datetime(df['Date'], errors='coerce')

            df = df.drop('Date', axis=1)

            # Remove rows with invalid dates
            before_count = len(df)
            df = df.dropna(subset=['date'])
            print(f"Removed {before_count - len(df)} rows with invalid dates")

            if not df.empty:
                print(f"Date range: {df['date'].min()} to {df['date'].max()}")

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
            'Keyword Text': 'keyword_text',
            'Keyword ID': 'keyword_id',
            'Match Type': 'match_type',
            'Customer Search Term': 'search_term',
            'Campaign Status': 'campaign_status',

            # Conversion columns
            '1 Day Advertised SKU Conversions': 'conversions_1d_sku',
            '1 Day Total Conversions': 'conversions_1d_total',
            '7 Day Advertised SKU Conversions': 'conversions_7d_sku',
            '7 Day Total Conversions': 'conversions_7d_total',
            '14 Day Advertised SKU Conversions': 'conversions_14d_sku',
            '14 Day Total Conversions': 'conversions_14d_total',
            '30 Day Advertised SKU Conversions': 'conversions_30d_sku',
            '30 Day Total Conversions': 'conversions_30d_total',

            # Units columns
            '1 Day Advertised SKU Units': 'units_1d_sku',
            '1 Day Total Units': 'units_1d_total',
            '7 Day Advertised SKU Units': 'units_7d_sku',
            '7 Day Total Units': 'units_7d_total',
            '14 Day Advertised SKU Units': 'units_14d_sku',
            '14 Day Total Units': 'units_14d_total',
            '30 Day Advertised SKU Units': 'units_30d_sku',
            '30 Day Total Units': 'units_30d_total',

            # Sales columns
            '1 Day Advertised SKU Sales (*)': 'sales_1d_sku',
            '1 Day Total Sales (*)': 'sales_1d_total',
            '7 Day Advertised SKU Sales (*)': 'sales_7d_sku',
            '7 Day Total Sales (*)': 'sales_7d_total',
            '14 Day Advertised SKU Sales (*)': 'sales_14d_sku',
            '14 Day Total Sales (*)': 'sales_14d_total',
            '30 Day Advertised SKU Sales (*)': 'sales_30d_sku',
            '30 Day Total Sales (*)': 'sales_30d_total'
        }

        # Rename columns
        df = df.rename(columns=column_mapping)

        # Convert numeric columns
        numeric_cols = ['cost', 'clicks', 'impressions'] + [col for col in df.columns if col.startswith(('conversions_', 'units_', 'sales_'))]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # Fill NaN values for string columns
        string_cols = ['campaign_name', 'ad_group_name', 'portfolio_name', 'keyword_text', 'search_term', 'match_type', 'campaign_status']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('')

        # Fill NaN values for ID columns with 0
        id_cols = ['campaign_id', 'ad_group_id', 'keyword_id']
        for col in id_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int64')

        # Add calculated fields
        if 'cost' in df.columns and 'clicks' in df.columns:
            df['cpc'] = df['cost'] / df['clicks'].replace(0, np.nan)

        if 'clicks' in df.columns and 'impressions' in df.columns:
            df['ctr'] = (df['clicks'] / df['impressions'].replace(0, np.nan)) * 100

        if 'conversions_1d_total' in df.columns and 'clicks' in df.columns:
            df['conversion_rate_1d_total'] = (df['conversions_1d_total'] / df['clicks'].replace(0, np.nan)) * 100

        if 'conversions_1d_sku' in df.columns and 'clicks' in df.columns:
            df['conversion_rate_1d_sku'] = (df['conversions_1d_sku'] / df['clicks'].replace(0, np.nan)) * 100

        # Add quality flags
        df['has_keyword_data'] = df['keyword_text'].notna() & (df['keyword_text'] != '')
        df['has_search_term'] = df['search_term'].notna() & (df['search_term'] != '')
        df['has_performance'] = (df['clicks'] > 0) | (df['impressions'] > 0) | (df['cost'] > 0)

        # Add date components
        if 'date' in df.columns:
            df['year'] = df['date'].dt.year
            df['month'] = df['date'].dt.month
            df['day'] = df['date'].dt.day
            df['weekday'] = df['date'].dt.weekday

        print(f"Processed shape: {df.shape}")
        print(f"Processed columns: {list(df.columns)}")

        return df

    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        return None

def create_bigquery_table(client, dataset_id, table_id, df):
    """Create BigQuery table with appropriate schema"""
    dataset_ref = client.dataset(dataset_id)
    table_ref = dataset_ref.table(table_id)

    # Create dataset if it doesn't exist
    try:
        client.get_dataset(dataset_id)
    except:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = 'US'
        client.create_dataset(dataset)
        print(f"Created dataset {dataset_id}")

    # Build schema
    schema = []
    for col in df.columns:
        if col == 'date':
            schema.append(bigquery.SchemaField(col, "DATETIME"))
        elif col in ['campaign_id', 'ad_group_id', 'keyword_id'] or col.endswith('_id'):
            schema.append(bigquery.SchemaField(col, "INTEGER"))
        elif col in ['has_keyword_data', 'has_search_term', 'has_performance']:
            schema.append(bigquery.SchemaField(col, "BOOLEAN"))
        elif df[col].dtype in ['int64', 'Int64']:
            schema.append(bigquery.SchemaField(col, "INTEGER"))
        elif df[col].dtype in ['float64', 'Float64']:
            schema.append(bigquery.SchemaField(col, "FLOAT"))
        else:
            schema.append(bigquery.SchemaField(col, "STRING"))

    # Create table
    table = bigquery.Table(table_ref, schema=schema)
    table = client.create_table(table, exists_ok=True)

    print(f"✅ Created/verified table {table_id}")
    return table_ref

def upload_to_bigquery(df, table_ref, client):
    """Upload DataFrame to BigQuery"""
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE"
    )

    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()

    print(f"✅ Loaded {len(df)} rows into {table_ref.table_id}")

def create_enhanced_keywords_view(client):
    """Create unified view combining all keyword data"""

    view_query = f"""
    CREATE OR REPLACE TABLE `{PROJECT_ID}.{DATASET_ID}.keywords_enhanced` AS

    -- Combine data from all three sources
    SELECT * FROM (
      -- Data from conversions_orders table
      SELECT
        *,
        'conversions_orders' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.conversions_orders`
      WHERE date IS NOT NULL

      UNION ALL

      -- Data from keywords table
      SELECT
        *,
        'keywords' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.keywords`
      WHERE date IS NOT NULL

      UNION ALL

      -- Data from daily_keywords table
      SELECT
        *,
        'daily_keywords' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.daily_keywords`
      WHERE date IS NOT NULL
    )
    WHERE has_performance = TRUE
    ORDER BY date DESC, cost DESC
    """

    query_job = client.query(view_query)
    query_job.result()
    print("✅ Created enhanced keywords table")

def update_master_ads_table(client):
    """Update MASTER.TOTAL_DAILY_ADS table with latest Amazon data"""

    update_query = f"""
    CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS` AS
    WITH amazon_daily AS (
      SELECT
        CAST(date AS DATE) as date,
        SUM(cost) as amazon_ads_spend,
        SUM(clicks) as amazon_ads_clicks,
        SUM(impressions) as amazon_ads_impressions,
        SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
        COUNT(DISTINCT campaign_id) as amazon_campaigns
      FROM `{PROJECT_ID}.{DATASET_ID}.keywords_enhanced`
      WHERE date IS NOT NULL
        AND has_performance = TRUE
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

    query_job = client.query(update_query)
    query_job.result()
    print("✅ Updated MASTER.TOTAL_DAILY_ADS table")

def main():
    """Main sync function"""
    print(f"🚀 Starting Amazon Ads SharePoint Sync - {datetime.now()}")

    # Initialize BigQuery client
    client = bigquery.Client(project=PROJECT_ID)

    processed_tables = []

    # Process each SharePoint file
    for table_name, sharepoint_url in SHAREPOINT_FILES.items():
        print(f"\n📊 Processing {table_name}...")

        # Download file
        local_file = download_sharepoint_excel(sharepoint_url, table_name)

        if local_file:
            # Process the Excel file
            df = process_amazon_ads_excel(local_file, table_name)

            if df is not None and not df.empty:
                # Create and populate table
                table_ref = create_bigquery_table(client, DATASET_ID, table_name, df)
                upload_to_bigquery(df, table_ref, client)
                processed_tables.append(table_name)
            else:
                print(f"❌ No data to process for {table_name}")
        else:
            print(f"❌ Could not download {table_name}")

    if processed_tables:
        print(f"\n🔄 Creating enhanced keywords table...")
        create_enhanced_keywords_view(client)

        print(f"\n📈 Updating MASTER ads table...")
        update_master_ads_table(client)

        # Verify the data
        print(f"\n📊 Latest data verification:")
        sample_query = f"""
        SELECT
          date,
          amazon_ads_spend,
          amazon_ads_clicks,
          amazon_ads_impressions,
          amazon_campaigns
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS`
        ORDER BY date DESC
        LIMIT 10
        """

        results = client.query(sample_query).result()
        for row in results:
            print(f"  {row.date}: ${row.amazon_ads_spend:.2f} spend, {row.amazon_ads_clicks} clicks, {row.amazon_ads_impressions} impressions")

        print(f"\n✅ Sync complete! Processed: {', '.join(processed_tables)}")

        # Check date coverage
        coverage_query = f"""
        SELECT
          MIN(date) as earliest_date,
          MAX(date) as latest_date,
          COUNT(DISTINCT date) as total_days
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS`
        """

        coverage_results = list(client.query(coverage_query).result())
        if coverage_results:
            row = coverage_results[0]
            print(f"📅 Data coverage: {row.earliest_date} to {row.latest_date} ({row.total_days} days)")

            # Check if data is current
            today = datetime.now().date()
            if row.latest_date:
                days_behind = (today - row.latest_date).days
                if days_behind <= 1:
                    print(f"✅ Data is current (updated within {days_behind} days)")
                else:
                    print(f"⚠️  Data is {days_behind} days behind current date")
    else:
        print("❌ No tables were processed successfully")

if __name__ == "__main__":
    main()