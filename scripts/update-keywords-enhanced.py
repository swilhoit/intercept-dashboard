#!/usr/bin/env python3
"""
Update keywords_enhanced table with historical data from SharePoint sync
Transforms the historical SharePoint data and rebuilds the enhanced keywords table
"""

import os
from google.cloud import bigquery

def setup_environment():
    """Load environment variables"""
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

def merge_historical_data():
    """Merge historical data into main tables and rebuild keywords_enhanced"""

    client = bigquery.Client()

    print("🔄 Merging historical SharePoint data into main tables...")

    # 1. Transform and merge conversions_orders historical data
    print("📊 Processing conversions_orders historical data...")

    conversions_transform_query = """
    INSERT INTO `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders`
    SELECT
      -- Try to extract date from version_date since Date column didn't work
      DATE(version_date) as date,
      Campaign_ID as campaign_id,
      Campaign_Name as campaign_name,
      Campaign_Status as campaign_status,
      Ad_Group_ID as ad_group_id,
      Ad_Group_Name as ad_group_name,
      Portfolio_Name as portfolio_name,
      NULL as keyword_id,
      NULL as keyword_text,
      NULL as search_term,
      NULL as match_type,
      Clicks as clicks,
      Cost_asterisk as cost,
      Impressions as impressions,
      col_1_Day_Total_Conversions as conversions_1d_total,
      col_1_Day_Advertised_SKU_Conversions as conversions_1d_sku
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders_historical`
    WHERE version_date >= '2025-09-05'  -- Only get data after current latest date
      AND Campaign_ID IS NOT NULL
      AND DATE(version_date) NOT IN (
        SELECT DISTINCT date
        FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders`
        WHERE date IS NOT NULL
      )
    """

    job = client.query(conversions_transform_query)
    result = job.result()
    print(f"✅ Merged {job.num_dml_affected_rows} rows from conversions_orders_historical")

    # 2. Transform and merge daily_keywords historical data
    print("📊 Processing daily_keywords historical data...")

    keywords_transform_query = """
    INSERT INTO `intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords`
    SELECT
      DATE(version_date) as date,
      Campaign_ID as campaign_id,
      Campaign_Name as campaign_name,
      Campaign_Status as campaign_status,
      Ad_Group_ID as ad_group_id,
      Ad_Group_Name as ad_group_name,
      Portfolio_Name as portfolio_name,
      NULL as keyword_id,
      NULL as keyword_text,
      NULL as search_term,
      NULL as match_type,
      Clicks as clicks,
      Cost_asterisk as cost,
      Impressions as impressions,
      col_1_Day_Total_Conversions as conversions_1d_total,
      col_1_Day_Advertised_SKU_Conversions as conversions_1d_sku
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords_historical`
    WHERE version_date >= '2025-09-05'
      AND Campaign_ID IS NOT NULL
      AND DATE(version_date) NOT IN (
        SELECT DISTINCT date
        FROM `intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords`
        WHERE date IS NOT NULL
      )
    """

    job = client.query(keywords_transform_query)
    result = job.result()
    print(f"✅ Merged {job.num_dml_affected_rows} rows from daily_keywords_historical")

def rebuild_keywords_enhanced():
    """Rebuild the keywords_enhanced table with all data"""

    client = bigquery.Client()

    print("🔄 Rebuilding keywords_enhanced table...")

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
      date,
      campaign_id,
      campaign_name,
      campaign_status,
      ad_group_id,
      ad_group_name,
      portfolio_name,
      keyword_id,
      keyword_text,
      search_term,
      match_type,
      clicks,
      cost,
      impressions,
      conversions_1d_total,
      conversions_1d_sku,
      data_source,
      -- Calculated fields
      CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 4) ELSE 0 END as cpc,
      CASE WHEN impressions > 0 THEN ROUND((clicks * 100.0) / impressions, 4) ELSE 0 END as ctr,
      CASE WHEN clicks > 0 THEN ROUND((conversions_1d_total * 100.0) / clicks, 4) ELSE 0 END as conversion_rate_1d_total,
      CASE WHEN clicks > 0 THEN ROUND((conversions_1d_sku * 100.0) / clicks, 4) ELSE 0 END as conversion_rate_1d_sku,
      keyword_id IS NOT NULL OR keyword_text IS NOT NULL as has_keyword_data,
      search_term IS NOT NULL as has_search_term,
      clicks > 0 OR impressions > 0 OR cost > 0 as has_performance,
      EXTRACT(YEAR FROM date) as year,
      EXTRACT(MONTH FROM date) as month,
      EXTRACT(DAY FROM date) as day,
      EXTRACT(DAYOFWEEK FROM date) as weekday
    FROM unified_data
    ORDER BY date DESC, campaign_id, ad_group_id
    """

    job = client.query(enhance_query)
    result = job.result()
    print(f"✅ Keywords enhanced table rebuilt successfully")

    # Check the result
    check_query = """
    SELECT
      COUNT(*) as total_rows,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      COUNT(DISTINCT data_source) as data_sources
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    """

    job = client.query(check_query)
    results = list(job.result())

    for row in results:
        print(f"📊 Enhanced table summary:")
        print(f"   • Total rows: {row.total_rows:,}")
        print(f"   • Date range: {row.earliest_date} to {row.latest_date}")
        print(f"   • Data sources: {row.data_sources}")

def main():
    """Main function to update keywords enhanced with historical data"""

    print("🚀 Updating Amazon Ads Dashboard Data")
    print("=" * 50)

    setup_environment()

    try:
        # Step 1: Merge historical data into main tables
        merge_historical_data()

        # Step 2: Rebuild keywords_enhanced table
        rebuild_keywords_enhanced()

        print("\n🎉 Dashboard data update complete!")
        print("✅ Recent Amazon ads data should now be visible in the dashboard")

    except Exception as e:
        print(f"❌ Error updating dashboard data: {e}")
        return False

    return True

if __name__ == "__main__":
    main()