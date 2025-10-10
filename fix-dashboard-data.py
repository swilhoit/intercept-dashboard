#!/usr/bin/env python3
"""
Fix dashboard data by rebuilding keywords_enhanced directly from historical data
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

def rebuild_keywords_enhanced_directly():
    """Rebuild keywords_enhanced table directly from historical and current data"""

    client = bigquery.Client()

    print("🔄 Rebuilding keywords_enhanced table with all available data...")

    # Rebuild with current data + historical data
    enhance_query = """
    CREATE OR REPLACE TABLE `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced` AS
    WITH current_data AS (
      -- Existing data from keywords_enhanced (up to Sept 4)
      SELECT *
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
      WHERE date <= '2025-09-04'
    ),
    historical_conversions AS (
      -- Historical data from SharePoint sync (Sept 5 onwards)
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
        col_1_Day_Advertised_SKU_Conversions as conversions_1d_sku,
        'historical_conversions' as data_source,
        -- Calculated fields
        CASE WHEN Clicks > 0 THEN ROUND(Cost_asterisk / Clicks, 4) ELSE 0 END as cpc,
        CASE WHEN Impressions > 0 THEN ROUND((Clicks * 100.0) / Impressions, 4) ELSE 0 END as ctr,
        CASE WHEN Clicks > 0 THEN ROUND((col_1_Day_Total_Conversions * 100.0) / Clicks, 4) ELSE 0 END as conversion_rate_1d_total,
        CASE WHEN Clicks > 0 THEN ROUND((col_1_Day_Advertised_SKU_Conversions * 100.0) / Clicks, 4) ELSE 0 END as conversion_rate_1d_sku,
        FALSE as has_keyword_data,
        FALSE as has_search_term,
        Clicks > 0 OR Impressions > 0 OR Cost_asterisk > 0 as has_performance,
        EXTRACT(YEAR FROM DATE(version_date)) as year,
        EXTRACT(MONTH FROM DATE(version_date)) as month,
        EXTRACT(DAY FROM DATE(version_date)) as day,
        EXTRACT(DAYOFWEEK FROM DATE(version_date)) as weekday
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders_historical`
      WHERE version_date >= '2025-09-05'
        AND Campaign_ID IS NOT NULL
        AND Clicks IS NOT NULL
    ),
    historical_keywords AS (
      -- Historical keywords data
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
        col_1_Day_Advertised_SKU_Conversions as conversions_1d_sku,
        'historical_keywords' as data_source,
        -- Calculated fields
        CASE WHEN Clicks > 0 THEN ROUND(Cost_asterisk / Clicks, 4) ELSE 0 END as cpc,
        CASE WHEN Impressions > 0 THEN ROUND((Clicks * 100.0) / Impressions, 4) ELSE 0 END as ctr,
        CASE WHEN Clicks > 0 THEN ROUND((col_1_Day_Total_Conversions * 100.0) / Clicks, 4) ELSE 0 END as conversion_rate_1d_total,
        CASE WHEN Clicks > 0 THEN ROUND((col_1_Day_Advertised_SKU_Conversions * 100.0) / Clicks, 4) ELSE 0 END as conversion_rate_1d_sku,
        FALSE as has_keyword_data,
        FALSE as has_search_term,
        Clicks > 0 OR Impressions > 0 OR Cost_asterisk > 0 as has_performance,
        EXTRACT(YEAR FROM DATE(version_date)) as year,
        EXTRACT(MONTH FROM DATE(version_date)) as month,
        EXTRACT(DAY FROM DATE(version_date)) as day,
        EXTRACT(DAYOFWEEK FROM DATE(version_date)) as weekday
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.daily_keywords_historical`
      WHERE version_date >= '2025-09-05'
        AND Campaign_ID IS NOT NULL
        AND Clicks IS NOT NULL
    )
    SELECT * FROM current_data
    UNION ALL
    SELECT * FROM historical_conversions
    UNION ALL
    SELECT * FROM historical_keywords
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
      COUNT(DISTINCT data_source) as data_sources,
      COUNT(DISTINCT DATE(date)) as unique_dates
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    """

    job = client.query(check_query)
    results = list(job.result())

    for row in results:
        print(f"📊 Enhanced table summary:")
        print(f"   • Total rows: {row.total_rows:,}")
        print(f"   • Date range: {row.earliest_date} to {row.latest_date}")
        print(f"   • Unique dates: {row.unique_dates}")
        print(f"   • Data sources: {row.data_sources}")

    # Check recent data specifically
    recent_query = """
    SELECT
      COUNT(*) as recent_rows,
      COUNT(DISTINCT DATE(date)) as recent_dates
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    WHERE date >= '2025-09-05'
    """

    job = client.query(recent_query)
    results = list(job.result())

    for row in results:
        print(f"📅 Recent data (Sept 5+): {row.recent_rows:,} rows across {row.recent_dates} dates")

def main():
    """Main function to fix dashboard data"""

    print("🚀 Fixing Amazon Ads Dashboard Data")
    print("=" * 50)

    setup_environment()

    try:
        rebuild_keywords_enhanced_directly()

        print("\n🎉 Dashboard data fix complete!")
        print("✅ Recent Amazon ads data should now be visible in the dashboard")
        print("🔗 The dashboard will now show data from August 5 through October 7, 2025")

    except Exception as e:
        print(f"❌ Error fixing dashboard data: {e}")
        return False

    return True

if __name__ == "__main__":
    main()