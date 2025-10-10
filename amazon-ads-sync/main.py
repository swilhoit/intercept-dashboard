#!/usr/bin/env python3
"""
Cloud Function: Amazon Ads SharePoint Sync
Downloads and processes Amazon ads data from SharePoint into BigQuery
"""

import functions_framework
import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import numpy as np
import requests
import os
import logging
from io import StringIO
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
DATASET_ID = 'amazon_ads_sharepoint'

# SharePoint URLs for direct CSV download (these need to be updated with actual download links)
SHAREPOINT_CSV_URLS = {
    'conversions_orders': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EC18CF9A-BEE7-4538-B3DF-5577A3A500D8',
    'keywords': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/E013DC5AD-6754-4C02-BD78-3714D80965FE',
    'daily_keywords': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/EBDBC5289-A91B-4A22-91BF-21B443C1EE12'
}

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper datetime"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        excel_epoch = datetime(1899, 12, 30)
        return excel_epoch + timedelta(days=int(float(serial_date)))
    except (ValueError, TypeError):
        return None

def download_sharepoint_csv(url, table_name):
    """Download CSV data from SharePoint (placeholder - needs actual implementation)"""
    logger.info(f"Downloading {table_name} from SharePoint...")

    # For now, return None to indicate no download
    # In production, this would implement actual SharePoint authentication and download
    logger.warning(f"SharePoint download not implemented yet for {table_name}")
    return None

def process_csv_data(csv_content, table_name):
    """Process CSV content and prepare for BigQuery"""
    logger.info(f"Processing {table_name} data...")

    try:
        # Read CSV from string content
        df = pd.read_csv(StringIO(csv_content))

        if df.empty:
            logger.warning(f"No data in {table_name}")
            return None

        logger.info(f"Original shape: {df.shape}")

        # Handle date conversion
        if 'Date' in df.columns:
            logger.info("Converting dates...")
            df['date'] = df['Date'].apply(excel_serial_to_date)
            df = df.drop('Date', axis=1)
            df = df.dropna(subset=['date'])

            if not df.empty:
                logger.info(f"Date range: {df['date'].min()} to {df['date'].max()}")

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

        # Fill NaN values for ID columns
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

        logger.info(f"Processed shape: {df.shape}")
        return df

    except Exception as e:
        logger.error(f"Error processing {table_name}: {e}")
        return None

def upload_to_bigquery(df, dataset_id, table_id):
    """Upload DataFrame to BigQuery"""
    client = bigquery.Client(project=PROJECT_ID)

    # Create dataset if needed
    try:
        client.get_dataset(dataset_id)
    except:
        dataset = bigquery.Dataset(client.dataset(dataset_id))
        dataset.location = 'US'
        client.create_dataset(dataset)
        logger.info(f"Created dataset {dataset_id}")

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

    # Create table reference
    table_ref = client.dataset(dataset_id).table(table_id)
    table = bigquery.Table(table_ref, schema=schema)
    table = client.create_table(table, exists_ok=True)

    # Upload data
    job_config = bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE")
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()

    logger.info(f"Loaded {len(df)} rows into {table_id}")

def create_enhanced_keywords_table():
    """Create unified enhanced keywords table"""
    client = bigquery.Client(project=PROJECT_ID)

    query = f"""
    CREATE OR REPLACE TABLE `{PROJECT_ID}.{DATASET_ID}.keywords_enhanced` AS
    SELECT * FROM (
      SELECT *, 'conversions_orders' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.conversions_orders`
      WHERE date IS NOT NULL

      UNION ALL

      SELECT *, 'keywords' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.keywords`
      WHERE date IS NOT NULL

      UNION ALL

      SELECT *, 'daily_keywords' as data_source
      FROM `{PROJECT_ID}.{DATASET_ID}.daily_keywords`
      WHERE date IS NOT NULL
    )
    WHERE has_performance = TRUE
    ORDER BY date DESC, cost DESC
    """

    query_job = client.query(query)
    query_job.result()
    logger.info("Created enhanced keywords table")

def update_master_ads_table():
    """Update MASTER.TOTAL_DAILY_ADS table"""
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
      FROM `{PROJECT_ID}.{DATASET_ID}.keywords_enhanced`
      WHERE date IS NOT NULL AND has_performance = TRUE
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

    query_job = client.query(query)
    query_job.result()
    logger.info("Updated MASTER.TOTAL_DAILY_ADS table")

@functions_framework.http
def amazon_ads_sync(request):
    """Main cloud function entry point"""
    logger.info(f"Starting Amazon Ads sync at {datetime.now()}")

    try:
        processed_tables = []

        # For now, since SharePoint download isn't implemented,
        # we'll return a message indicating the need for manual process

        result = {
            "status": "info",
            "message": "Amazon Ads sync function deployed successfully",
            "timestamp": datetime.now().isoformat(),
            "note": "SharePoint authentication needs to be configured for automatic downloads",
            "manual_process": "Run 'python3 import-sharepoint-amazon-ads.py' locally after downloading CSV files from SharePoint"
        }

        logger.info("Amazon Ads sync function executed successfully")
        return result

    except Exception as e:
        logger.error(f"Error in Amazon Ads sync: {e}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }