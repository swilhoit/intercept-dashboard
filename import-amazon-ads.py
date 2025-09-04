#!/usr/bin/env python3
"""
Script to import Amazon Ads data from Excel file into BigQuery
Handles date fields properly and creates a comprehensive ads table
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import numpy as np

# Configuration
PROJECT_ID = 'intercept-sales-2508061117'
DATASET_ID = 'amazon_ads'
TABLE_ID = 'daily_campaign_metrics'  # New table with dates

def process_amazon_ads_excel(file_path):
    """
    Process the Amazon Ads Excel file and prepare for BigQuery import
    """
    # Read the Excel file
    # Adjust sheet_name if your data is in a different sheet
    df = pd.read_excel(file_path, sheet_name=0)
    
    # Print columns to understand the structure
    print("Columns in Excel file:")
    print(df.columns.tolist())
    print("\nFirst few rows:")
    print(df.head())
    
    # Common Amazon Ads column mappings (adjust based on your actual columns)
    column_mapping = {
        'Date': 'date',
        'Campaign Name': 'campaign_name',
        'Campaign': 'campaign_name',
        'Campaign ID': 'campaign_id',
        'Ad Group Name': 'ad_group_name',
        'Ad Group': 'ad_group_name',
        'Ad Group ID': 'ad_group_id',
        'Portfolio Name': 'portfolio_name',
        'Portfolio': 'portfolio_name',
        'Keyword': 'keyword_text',
        'Keyword Text': 'keyword_text',
        'Match Type': 'match_type',
        'Customer Search Term': 'search_term',
        'Search Term': 'search_term',
        'Impressions': 'impressions',
        'Clicks': 'clicks',
        'Spend': 'cost',
        'Cost': 'cost',
        'Sales': 'sales',
        'Orders': 'orders',
        'Units': 'units',
        'Conversion Rate': 'conversion_rate',
        'ACoS': 'acos',
        'ROAS': 'roas',
        'CPC': 'cpc',
        'CTR': 'ctr'
    }
    
    # Rename columns based on mapping
    df_renamed = df.rename(columns=column_mapping)
    
    # Ensure date column is in proper format
    if 'date' in df_renamed.columns:
        df_renamed['date'] = pd.to_datetime(df_renamed['date'])
    
    # Replace NaN values with None for BigQuery
    df_renamed = df_renamed.replace({np.nan: None})
    
    # Add calculated fields if they don't exist
    if 'cpc' not in df_renamed.columns and 'cost' in df_renamed.columns and 'clicks' in df_renamed.columns:
        df_renamed['cpc'] = df_renamed['cost'] / df_renamed['clicks'].replace(0, np.nan)
    
    if 'ctr' not in df_renamed.columns and 'clicks' in df_renamed.columns and 'impressions' in df_renamed.columns:
        df_renamed['ctr'] = (df_renamed['clicks'] / df_renamed['impressions'].replace(0, np.nan)) * 100
    
    if 'acos' not in df_renamed.columns and 'cost' in df_renamed.columns and 'sales' in df_renamed.columns:
        df_renamed['acos'] = (df_renamed['cost'] / df_renamed['sales'].replace(0, np.nan)) * 100
    
    if 'roas' not in df_renamed.columns and 'sales' in df_renamed.columns and 'cost' in df_renamed.columns:
        df_renamed['roas'] = df_renamed['sales'] / df_renamed['cost'].replace(0, np.nan)
    
    return df_renamed

def create_bigquery_table(client, dataset_id, table_id, df):
    """
    Create BigQuery table with appropriate schema based on DataFrame
    """
    dataset_ref = client.dataset(dataset_id)
    table_ref = dataset_ref.table(table_id)
    
    # Define schema based on DataFrame columns
    schema = []
    for col in df.columns:
        if col == 'date':
            schema.append(bigquery.SchemaField(col, "DATE"))
        elif df[col].dtype in ['int64', 'Int64']:
            schema.append(bigquery.SchemaField(col, "INTEGER"))
        elif df[col].dtype in ['float64', 'Float64']:
            schema.append(bigquery.SchemaField(col, "FLOAT"))
        else:
            schema.append(bigquery.SchemaField(col, "STRING"))
    
    # Create table
    table = bigquery.Table(table_ref, schema=schema)
    table = client.create_table(table, exists_ok=True)
    
    print(f"Created table {table_id} with schema:")
    for field in schema:
        print(f"  {field.name}: {field.field_type}")
    
    return table_ref

def upload_to_bigquery(df, table_ref, client):
    """
    Upload DataFrame to BigQuery table
    """
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE",  # Replace existing data
        schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION]
    )
    
    job = client.load_table_from_dataframe(
        df, table_ref, job_config=job_config
    )
    job.result()  # Wait for job to complete
    
    print(f"Loaded {len(df)} rows into {table_ref.table_id}")

def update_master_ads_table(client):
    """
    Update MASTER.TOTAL_DAILY_ADS table with Amazon ads data
    """
    query = """
    MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS` T
    USING (
      SELECT 
        date,
        SUM(cost) as amazon_spend,
        SUM(clicks) as amazon_clicks,
        SUM(impressions) as amazon_impressions
      FROM `intercept-sales-2508061117.amazon_ads.daily_campaign_metrics`
      GROUP BY date
    ) S
    ON T.date = S.date
    WHEN MATCHED THEN
      UPDATE SET 
        amazon_ads_spend = S.amazon_spend,
        amazon_ads_clicks = S.amazon_clicks,
        amazon_ads_impressions = S.amazon_impressions,
        total_spend = COALESCE(T.google_ads_spend, 0) + S.amazon_spend,
        total_clicks = COALESCE(T.google_ads_clicks, 0) + S.amazon_clicks,
        total_impressions = COALESCE(T.google_ads_impressions, 0) + S.amazon_impressions,
        created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (date, amazon_ads_spend, amazon_ads_clicks, amazon_ads_impressions, 
              google_ads_spend, google_ads_clicks, google_ads_impressions,
              total_spend, total_clicks, total_impressions, created_at)
      VALUES (S.date, S.amazon_spend, S.amazon_clicks, S.amazon_impressions,
              0, 0, 0,
              S.amazon_spend, S.amazon_clicks, S.amazon_impressions,
              CURRENT_TIMESTAMP())
    """
    
    query_job = client.query(query)
    query_job.result()
    print("Updated MASTER.TOTAL_DAILY_ADS table with Amazon ads data")

def main():
    # Initialize BigQuery client
    client = bigquery.Client(project=PROJECT_ID)
    
    # Path to your Excel file - UPDATE THIS!
    # You need to download the file from SharePoint first
    excel_file_path = 'amazon_ads_data.xlsx'  # Update with actual path
    
    print("Processing Amazon Ads Excel file...")
    df = process_amazon_ads_excel(excel_file_path)
    
    print(f"\nProcessed {len(df)} rows of data")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    
    # Create and populate BigQuery table
    print(f"\nCreating BigQuery table {DATASET_ID}.{TABLE_ID}...")
    table_ref = create_bigquery_table(client, DATASET_ID, TABLE_ID, df)
    
    print("\nUploading data to BigQuery...")
    upload_to_bigquery(df, table_ref, client)
    
    # Update master ads table
    print("\nUpdating master ads table...")
    update_master_ads_table(client)
    
    print("\n✅ Import complete!")
    
    # Print sample query to verify
    print("\nSample data from new table:")
    query = f"""
    SELECT date, campaign_name, portfolio_name, 
           SUM(impressions) as impressions, 
           SUM(clicks) as clicks, 
           SUM(cost) as cost
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    GROUP BY date, campaign_name, portfolio_name
    ORDER BY date DESC
    LIMIT 5
    """
    results = client.query(query).result()
    for row in results:
        print(f"  {row.date}: {row.campaign_name} - ${row.cost:.2f}")

if __name__ == "__main__":
    main()