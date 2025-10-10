#!/usr/bin/env python3
"""
Daily Amazon Ads Update Script
Downloads latest data from SharePoint URLs and updates BigQuery
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import numpy as np
import os
import sys

def update_amazon_ads():
    """Update Amazon ads data with manual process until SharePoint auth is ready"""

    print(f"🚀 Amazon Ads Daily Update - {datetime.now()}")
    print("=" * 60)

    # Instructions for manual update
    instructions = """
    📋 MANUAL UPDATE PROCESS:

    1. Go to SharePoint and download fresh CSV exports from:
       • amazon ads.xlsx
       • amazon ads - conversions & orders.xlsx
       • amazon ads - daily keyword report.xlsx

    2. Save the CSV exports as:
       • amazon_ads_fresh.csv
       • conversions_orders_fresh.csv
       • daily_keywords_fresh.csv

    3. Run: python3 update-amazon-ads-daily.py

    4. The script will process the fresh data automatically
    """

    print(instructions)

    # Check for fresh files
    fresh_files = {
        'amazon_ads_fresh.csv': 'amazon_ads',
        'conversions_orders_fresh.csv': 'conversions_orders',
        'daily_keywords_fresh.csv': 'daily_keywords'
    }

    available_files = []
    for file_path, table_name in fresh_files.items():
        if os.path.exists(file_path):
            available_files.append((file_path, table_name))
            print(f"✅ Found: {file_path}")
        else:
            print(f"❌ Missing: {file_path}")

    if not available_files:
        print("\n❌ No fresh files found. Please download and save CSV files first.")
        return False

    # Process available files
    client = bigquery.Client(project='intercept-sales-2508061117')

    for file_path, table_name in available_files:
        print(f"\n📊 Processing {file_path}...")

        try:
            # Read CSV
            df = pd.read_csv(file_path)

            if df.empty:
                print(f"❌ No data in {file_path}")
                continue

            print(f"Original shape: {df.shape}")

            # Process dates
            if 'Date' in df.columns:
                df['date'] = pd.to_datetime(df['Date'], errors='coerce')
                df = df.drop('Date', axis=1)
                df = df.dropna(subset=['date'])

                if not df.empty:
                    print(f"Date range: {df['date'].min()} to {df['date'].max()}")

            # Standard column mapping
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
                '1 Day Advertised SKU Conversions': 'conversions_1d_sku',
                '1 Day Total Conversions': 'conversions_1d_total',
            }

            df = df.rename(columns=column_mapping)

            # Convert numeric columns
            numeric_cols = ['cost', 'clicks', 'impressions', 'conversions_1d_sku', 'conversions_1d_total']
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

            # Convert ID columns
            id_cols = ['campaign_id', 'ad_group_id', 'keyword_id']
            for col in id_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int64')

            # Fill string columns
            string_cols = ['campaign_name', 'ad_group_name', 'portfolio_name', 'keyword_text', 'search_term', 'match_type', 'campaign_status']
            for col in string_cols:
                if col in df.columns:
                    df[col] = df[col].fillna('')

            # Upload to BigQuery
            dataset_id = 'amazon_ads_sharepoint'
            table_ref = client.dataset(dataset_id).table(table_name)

            job_config = bigquery.LoadJobConfig(write_disposition="WRITE_TRUNCATE")
            job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
            job.result()

            print(f"✅ Loaded {len(df)} rows into {table_name}")

        except Exception as e:
            print(f"❌ Error processing {file_path}: {e}")

    # Recreate enhanced keywords table
    print(f"\n🔄 Updating enhanced keywords table...")

    enhance_query = """
    CREATE OR REPLACE TABLE `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced` AS
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
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords`
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
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders`
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
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords`
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

    try:
        query_job = client.query(enhance_query)
        query_job.result()
        print("✅ Enhanced keywords table updated")
    except Exception as e:
        print(f"❌ Error updating enhanced table: {e}")

    # Update MASTER table
    print(f"\n📈 Updating MASTER ads table...")

    master_query = """
    CREATE OR REPLACE TABLE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS` AS
    WITH amazon_daily AS (
      SELECT
        CAST(date AS DATE) as date,
        SUM(cost) as amazon_ads_spend,
        SUM(clicks) as amazon_ads_clicks,
        SUM(impressions) as amazon_ads_impressions,
        SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
        COUNT(DISTINCT campaign_id) as amazon_campaigns
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
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

    try:
        query_job = client.query(master_query)
        query_job.result()
        print("✅ MASTER ads table updated")
    except Exception as e:
        print(f"❌ Error updating MASTER table: {e}")

    # Final verification
    print(f"\n📊 Final verification...")

    verification_query = """
    SELECT
      MAX(date) as latest_date,
      MIN(date) as earliest_date,
      COUNT(DISTINCT date) as total_days,
      SUM(amazon_ads_spend) as total_spend
    FROM `intercept-sales-2508061117.MASTER.TOTAL_DAILY_ADS`
    """

    try:
        results = list(client.query(verification_query).result())
        if results:
            row = results[0]
            print(f"📅 Date range: {row.earliest_date} to {row.latest_date}")
            print(f"📊 Total days: {row.total_days}")
            print(f"💰 Total spend: ${row.total_spend:,.2f}")

            # Check if data is current
            if row.latest_date:
                from datetime import date
                days_behind = (date.today() - row.latest_date).days
                if days_behind <= 1:
                    print(f"✅ Data is current (within {days_behind} days)")
                else:
                    print(f"⚠️  Data is {days_behind} days behind")

        print(f"\n✅ Amazon ads data update complete!")

    except Exception as e:
        print(f"❌ Error in verification: {e}")

    return True

if __name__ == "__main__":
    update_amazon_ads()