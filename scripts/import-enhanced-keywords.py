#!/usr/bin/env python3
"""
Import enhanced keywords data with full column structure into BigQuery
Replaces the existing keywords table with comprehensive schema
"""

import os
import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import numpy as np

# Configuration
PROJECT_ID = 'intercept-sales-2508061117'
DATASET_ID = 'amazon_ads_sharepoint'
TABLE_ID = 'keywords_enhanced'

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper datetime"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        excel_epoch = datetime(1899, 12, 30)
        return excel_epoch + timedelta(days=int(float(serial_date)))
    except (ValueError, TypeError):
        return None

def process_keywords_data(csv_file):
    """Process keywords CSV and prepare for BigQuery"""
    print(f"\n{'='*60}")
    print(f"Processing Enhanced Keywords Data")
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
        
        if not df.empty:
            print(f"Date range: {df['date'].min()} to {df['date'].max()}")
    
    # Comprehensive column mapping for enhanced schema
    column_mapping = {
        'Customer Search Term': 'search_term',
        'Keyword ID': 'keyword_id',
        'Keyword Text': 'keyword_text',
        'Match Type': 'match_type',
        'Ad Group ID': 'ad_group_id',
        'Ad Group Name': 'ad_group_name',
        'Campaign ID': 'campaign_id',
        'Campaign Name': 'campaign_name',
        'Campaign Status': 'campaign_status',
        'Clicks': 'clicks',
        'Cost (*)': 'cost',
        'Impressions': 'impressions',
        'Portfolio Name': 'portfolio_name',
        '1 Day Total Conversions': 'conversions_1d_total',
        '1 Day Advertised SKU Conversions': 'conversions_1d_sku'
    }
    
    # Rename columns
    df = df.rename(columns=column_mapping)
    
    # Convert numeric columns
    numeric_cols = ['clicks', 'impressions', 'cost', 'conversions_1d_total', 'conversions_1d_sku']
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # Convert ID columns to integers
    id_cols = ['keyword_id', 'ad_group_id', 'campaign_id']
    for col in id_cols:
        if col in df.columns:
            # Handle empty strings and convert to int
            df[col] = df[col].astype(str).replace('', '0')
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int64')
    
    # Fill NaN values for string columns
    string_cols = ['search_term', 'keyword_text', 'match_type', 'ad_group_name', 
                   'campaign_name', 'campaign_status', 'portfolio_name']
    for col in string_cols:
        if col in df.columns:
            df[col] = df[col].fillna('')
    
    # Add calculated metrics
    df['cpc'] = np.where(df['clicks'] > 0, df['cost'] / df['clicks'], 0)
    df['ctr'] = np.where(df['impressions'] > 0, (df['clicks'] / df['impressions']) * 100, 0)
    df['conversion_rate_1d_total'] = np.where(df['clicks'] > 0, (df['conversions_1d_total'] / df['clicks']) * 100, 0)
    df['conversion_rate_1d_sku'] = np.where(df['clicks'] > 0, (df['conversions_1d_sku'] / df['clicks']) * 100, 0)
    
    # Round calculated metrics
    df['cpc'] = df['cpc'].round(2)
    df['ctr'] = df['ctr'].round(2) 
    df['conversion_rate_1d_total'] = df['conversion_rate_1d_total'].round(2)
    df['conversion_rate_1d_sku'] = df['conversion_rate_1d_sku'].round(2)
    
    # Add data quality flags
    df['has_keyword_data'] = (df['keyword_text'] != '') & (df['keyword_id'] > 0)
    df['has_search_term'] = df['search_term'] != ''
    df['has_performance'] = (df['clicks'] > 0) | (df['impressions'] > 0) | (df['cost'] > 0)
    
    # Add date-based fields for analysis
    df['year'] = df['date'].dt.year
    df['month'] = df['date'].dt.month  
    df['day'] = df['date'].dt.day
    df['weekday'] = df['date'].dt.dayofweek  # 0=Monday, 6=Sunday
    
    print(f"Enhanced shape: {df.shape}")
    print(f"Enhanced columns: {list(df.columns)}")
    
    return df

def create_enhanced_bigquery_table(client, dataset_id, table_id, df):
    """Create enhanced BigQuery table with comprehensive schema"""
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
    
    # Define comprehensive schema
    schema = [
        # Core identifiers
        bigquery.SchemaField("date", "DATE"),
        bigquery.SchemaField("keyword_id", "INTEGER"),
        bigquery.SchemaField("ad_group_id", "INTEGER"),  
        bigquery.SchemaField("campaign_id", "INTEGER"),
        
        # Text fields
        bigquery.SchemaField("keyword_text", "STRING"),
        bigquery.SchemaField("search_term", "STRING"),
        bigquery.SchemaField("match_type", "STRING"),
        bigquery.SchemaField("ad_group_name", "STRING"),
        bigquery.SchemaField("campaign_name", "STRING"),
        bigquery.SchemaField("campaign_status", "STRING"),
        bigquery.SchemaField("portfolio_name", "STRING"),
        
        # Performance metrics
        bigquery.SchemaField("clicks", "INTEGER"),
        bigquery.SchemaField("impressions", "INTEGER"),
        bigquery.SchemaField("cost", "FLOAT"),
        bigquery.SchemaField("conversions_1d_total", "INTEGER"),
        bigquery.SchemaField("conversions_1d_sku", "INTEGER"),
        
        # Calculated metrics
        bigquery.SchemaField("cpc", "FLOAT"),
        bigquery.SchemaField("ctr", "FLOAT"), 
        bigquery.SchemaField("conversion_rate_1d_total", "FLOAT"),
        bigquery.SchemaField("conversion_rate_1d_sku", "FLOAT"),
        
        # Data quality flags
        bigquery.SchemaField("has_keyword_data", "BOOLEAN"),
        bigquery.SchemaField("has_search_term", "BOOLEAN"), 
        bigquery.SchemaField("has_performance", "BOOLEAN"),
        
        # Date components for analysis
        bigquery.SchemaField("year", "INTEGER"),
        bigquery.SchemaField("month", "INTEGER"),
        bigquery.SchemaField("day", "INTEGER"),
        bigquery.SchemaField("weekday", "INTEGER"),
    ]
    
    # Create table
    table = bigquery.Table(table_ref, schema=schema)
    table = client.create_table(table, exists_ok=True)
    
    print(f"✅ Created enhanced table {table_id} with {len(schema)} columns")
    return table_ref

def upload_to_bigquery(df, table_ref, client):
    """Upload DataFrame to BigQuery"""
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE"
    )
    
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()
    
    print(f"✅ Loaded {len(df)} rows into {table_ref.table_id}")

def create_enhanced_views(client):
    """Create helpful views for analysis"""
    
    # Performance summary by campaign
    campaign_view_query = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{DATASET_ID}.campaign_performance` AS
    SELECT 
        date,
        campaign_id,
        campaign_name,
        campaign_status,
        portfolio_name,
        COUNT(*) as keyword_count,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as active_keywords,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        SUM(cost) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        ROUND(AVG(cpc), 2) as avg_cpc,
        ROUND(AVG(ctr), 2) as avg_ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    WHERE has_performance = TRUE
    GROUP BY date, campaign_id, campaign_name, campaign_status, portfolio_name
    ORDER BY date DESC, total_cost DESC
    """
    
    # Top performing keywords
    keyword_view_query = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{DATASET_ID}.top_keywords` AS
    SELECT 
        keyword_text,
        keyword_id,
        campaign_name,
        match_type,
        search_term,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions,
        SUM(cost) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate,
        COUNT(DISTINCT date) as active_days
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    WHERE has_keyword_data = TRUE AND has_performance = TRUE
    GROUP BY keyword_text, keyword_id, campaign_name, match_type, search_term
    HAVING total_clicks > 0
    ORDER BY total_cost DESC
    """
    
    # Daily performance trends
    daily_view_query = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{DATASET_ID}.daily_trends` AS
    SELECT 
        date,
        weekday,
        COUNT(DISTINCT campaign_id) as active_campaigns,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as active_keywords,
        SUM(clicks) as total_clicks,
        SUM(impressions) as total_impressions, 
        SUM(cost) as total_cost,
        SUM(conversions_1d_total) as total_conversions,
        ROUND(SAFE_DIVIDE(SUM(cost), SUM(clicks)), 2) as avg_cpc,
        ROUND(SAFE_DIVIDE(SUM(clicks) * 100.0, SUM(impressions)), 2) as ctr,
        ROUND(SAFE_DIVIDE(SUM(conversions_1d_total) * 100.0, SUM(clicks)), 2) as conversion_rate
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    WHERE has_performance = TRUE
    GROUP BY date, weekday
    ORDER BY date DESC
    """
    
    # Execute view creation
    for name, query in [
        ("campaign_performance", campaign_view_query),
        ("top_keywords", keyword_view_query), 
        ("daily_trends", daily_view_query)
    ]:
        try:
            query_job = client.query(query)
            query_job.result()
            print(f"✅ Created view: {name}")
        except Exception as e:
            print(f"❌ Failed to create view {name}: {e}")

def main():
    # Initialize BigQuery client
    client = bigquery.Client(project=PROJECT_ID)
    
    # Process the keywords data
    csv_file = 'keywords_Funnel_data_data.csv'
    
    if not os.path.exists(csv_file):
        print(f"❌ CSV file not found: {csv_file}")
        print("Please run the SharePoint extraction script first.")
        return
    
    df = process_keywords_data(csv_file)
    
    if df is None or df.empty:
        print("❌ No data to process")
        return
    
    # Create and populate enhanced table
    print(f"\n🚀 Creating enhanced BigQuery table...")
    table_ref = create_enhanced_bigquery_table(client, DATASET_ID, TABLE_ID, df)
    
    print(f"\n📤 Uploading data to BigQuery...")
    upload_to_bigquery(df, table_ref, client)
    
    # Create helpful views
    print(f"\n🔍 Creating analysis views...")
    create_enhanced_views(client)
    
    # Show sample data
    print(f"\n📊 Sample data from enhanced table:")
    sample_query = f"""
    SELECT date, campaign_name, keyword_text, search_term, clicks, cost, conversions_1d_total, cpc, ctr
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    WHERE has_performance = TRUE
    ORDER BY cost DESC
    LIMIT 10
    """
    
    results = client.query(sample_query).result()
    for row in results:
        print(f"  {row.date}: {row.campaign_name[:30]:<30} | {row.keyword_text[:20]:<20} | ${row.cost:>6.2f} | {row.clicks:>3} clicks | {row.conversions_1d_total:>2} conv")
    
    # Show summary stats
    print(f"\n📈 Data Summary:")
    summary_query = f"""
    SELECT 
        COUNT(*) as total_rows,
        COUNT(DISTINCT campaign_id) as unique_campaigns,
        COUNT(DISTINCT CASE WHEN has_keyword_data THEN keyword_id END) as unique_keywords,
        MIN(date) as date_from,
        MAX(date) as date_to,
        SUM(clicks) as total_clicks,
        SUM(cost) as total_cost,
        SUM(conversions_1d_total) as total_conversions
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    """
    
    summary_results = client.query(summary_query).result()
    for row in summary_results:
        print(f"  📊 {row.total_rows:,} rows | {row.unique_campaigns} campaigns | {row.unique_keywords} keywords")
        print(f"  📅 Date range: {row.date_from} to {row.date_to}")
        print(f"  💰 ${row.total_cost:,.2f} spend | {row.total_clicks:,} clicks | {row.total_conversions:,} conversions")
    
    print(f"\n✅ Enhanced keywords import complete!")

if __name__ == "__main__":
    main()