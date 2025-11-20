#!/usr/bin/env python3
"""
Import Amazon Ads data from SharePoint Excel files into BigQuery
Handles Excel serial dates and creates comprehensive ads tables
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import numpy as np
import os

# Configuration
PROJECT_ID = 'intercept-sales-2508061117'
DATASET_ID = 'amazon_ads_sharepoint'

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

def process_amazon_ads_data(csv_file, table_name):
    """Process Amazon ads CSV and prepare for BigQuery"""
    print(f"\n{'='*60}")
    print(f"Processing: {csv_file}")
    print(f"Table: {table_name}")
    print(f"{'='*60}")
    
    # Read CSV
    df = pd.read_csv(csv_file)
    
    if df.empty or len(df) == 0:
        print(f"❌ No data in {csv_file}")
        return None
    
    print(f"Original shape: {df.shape}")
    print(f"Original columns: {list(df.columns)}")
    
    # Convert Excel serial dates to proper dates
    if 'Date' in df.columns:
        print(f"Converting Excel serial dates...")
        df['date'] = df['Date'].apply(excel_serial_to_date)
        df = df.drop('Date', axis=1)
        
        # Remove rows with invalid dates
        df = df.dropna(subset=['date'])
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
    
    print(f"Processed shape: {df.shape}")
    print(f"Processed columns: {list(df.columns)}")
    
    return df

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
            schema.append(bigquery.SchemaField(col, "DATE"))
        elif col in ['campaign_id', 'ad_group_id', 'keyword_id'] or col.endswith('_id'):
            schema.append(bigquery.SchemaField(col, "INTEGER"))
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

def create_master_ads_table(client):
    """Create and populate MASTER.TOTAL_DAILY_ADS table with Amazon data"""
    
    # Create MASTER dataset if needed
    try:
        client.get_dataset('MASTER')
    except:
        master_dataset = bigquery.Dataset(client.dataset('MASTER'))
        master_dataset.location = 'US'
        client.create_dataset(master_dataset)
        print("Created MASTER dataset")
    
    # Create the master ads table
    create_master_table_query = f"""
    CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS` AS
    WITH amazon_daily AS (
      -- Aggregate Amazon ads data by date
      SELECT 
        date,
        SUM(cost) as amazon_ads_spend,
        SUM(clicks) as amazon_ads_clicks,
        SUM(impressions) as amazon_ads_impressions,
        SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
        COUNT(DISTINCT campaign_id) as amazon_campaigns
      FROM `{PROJECT_ID}.{DATASET_ID}.conversions_orders`
      WHERE date IS NOT NULL
      GROUP BY date
      
      UNION ALL
      
      SELECT 
        date,
        SUM(cost) as amazon_ads_spend,
        SUM(clicks) as amazon_ads_clicks, 
        SUM(impressions) as amazon_ads_impressions,
        SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
        COUNT(DISTINCT campaign_id) as amazon_campaigns
      FROM `{PROJECT_ID}.{DATASET_ID}.keywords`
      WHERE date IS NOT NULL
      GROUP BY date
    ),
    amazon_aggregated AS (
      SELECT
        date,
        SUM(amazon_ads_spend) as amazon_ads_spend,
        SUM(amazon_ads_clicks) as amazon_ads_clicks,
        SUM(amazon_ads_impressions) as amazon_ads_impressions,
        SUM(amazon_ads_conversions) as amazon_ads_conversions,
        MAX(amazon_campaigns) as amazon_campaigns
      FROM amazon_daily
      GROUP BY date
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
    FROM amazon_aggregated
    ORDER BY date DESC
    """
    
    query_job = client.query(create_master_table_query)
    query_job.result()
    print("✅ Created MASTER.TOTAL_DAILY_ADS table")

def main():
    # Initialize BigQuery client
    client = bigquery.Client(project=PROJECT_ID)
    
    # Files to process
    files_to_process = [
        ('amazon ads - conversions & orders_data.csv', 'conversions_orders'),
        ('keywords_data.csv', 'keywords'),
        ('amazon ads - daily keyword report_data.csv', 'daily_keywords')
    ]
    
    processed_tables = []
    
    for csv_file, table_name in files_to_process:
        if os.path.exists(csv_file):
            df = process_amazon_ads_data(csv_file, table_name)
            
            if df is not None and not df.empty:
                # Create and populate table
                table_ref = create_bigquery_table(client, DATASET_ID, table_name, df)
                upload_to_bigquery(df, table_ref, client)
                processed_tables.append(table_name)
            else:
                print(f"❌ Skipping {csv_file} - no data")
        else:
            print(f"❌ File not found: {csv_file}")
    
    if processed_tables:
        print(f"\n🚀 Creating MASTER ads table...")
        create_master_ads_table(client)
        
        # Verify the data
        print(f"\n📊 Sample data from MASTER.TOTAL_DAILY_ADS:")
        sample_query = f"""
        SELECT date, amazon_ads_spend, amazon_ads_clicks, amazon_ads_impressions, amazon_campaigns
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS`
        ORDER BY date DESC
        LIMIT 10
        """
        
        results = client.query(sample_query).result()
        for row in results:
            print(f"  {row.date}: ${row.amazon_ads_spend:.2f} spend, {row.amazon_ads_clicks} clicks, {row.amazon_ads_impressions} impressions")
        
        print(f"\n✅ Import complete! Processed tables: {', '.join(processed_tables)}")
    else:
        print("❌ No tables were processed")

if __name__ == "__main__":
    main()