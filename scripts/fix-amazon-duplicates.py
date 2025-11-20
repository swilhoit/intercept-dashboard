#!/usr/bin/env python3
"""
Fix Amazon ads data by properly extracting unique daily data from SharePoint versions
The issue: SharePoint versions contain cumulative data, not daily incremental data
Solution: Extract only the latest version per day and deduplicate properly
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

def add_recent_data_correctly():
    """Add recent data by taking only the latest version per day and filtering for actual new records"""

    client = bigquery.Client()

    print("🔄 Adding recent Amazon ads data correctly...")

    # Strategy: For dates after Sep 4, take only records that represent actual daily activity
    # We'll use the latest version per day and filter to avoid duplicates

    insert_query = """
    INSERT INTO `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    WITH latest_version_per_day AS (
      SELECT
        DATE(version_date) as extract_date,
        MAX(version_date) as latest_version_time
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders_historical`
      WHERE DATE(version_date) > '2025-09-04'
      GROUP BY DATE(version_date)
    ),
    daily_data AS (
      SELECT
        h.*,
        DATE(h.version_date) as extract_date
      FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders_historical` h
      INNER JOIN latest_version_per_day l
        ON h.version_date = l.latest_version_time
      WHERE DATE(h.version_date) > '2025-09-04'
        AND h.Campaign_ID IS NOT NULL
        AND h.Clicks IS NOT NULL
    ),
    aggregated_daily AS (
      -- Aggregate by date and campaign to avoid duplicates within each day's data
      SELECT
        extract_date as date,
        Campaign_ID as campaign_id,
        Campaign_Name as campaign_name,
        Campaign_Status as campaign_status,
        Ad_Group_ID as ad_group_id,
        Ad_Group_Name as ad_group_name,
        Portfolio_Name as portfolio_name,
        CAST(NULL AS STRING) as keyword_id,
        CAST(NULL AS STRING) as keyword_text,
        CAST(NULL AS STRING) as search_term,
        CAST(NULL AS STRING) as match_type,
        SUM(Clicks) as clicks,
        SUM(Cost_asterisk) as cost,
        SUM(Impressions) as impressions,
        SUM(col_1_Day_Total_Conversions) as conversions_1d_total,
        SUM(col_1_Day_Advertised_SKU_Conversions) as conversions_1d_sku,
        'recent_sharepoint' as data_source
      FROM daily_data
      GROUP BY
        extract_date, Campaign_ID, Campaign_Name, Campaign_Status,
        Ad_Group_ID, Ad_Group_Name, Portfolio_Name
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
      FALSE as has_keyword_data,
      FALSE as has_search_term,
      clicks > 0 OR impressions > 0 OR cost > 0 as has_performance,
      EXTRACT(YEAR FROM date) as year,
      EXTRACT(MONTH FROM date) as month,
      EXTRACT(DAY FROM date) as day,
      EXTRACT(DAYOFWEEK FROM date) as weekday
    FROM aggregated_daily
    WHERE cost > 0 OR clicks > 0 OR impressions > 0
    """

    job = client.query(insert_query)
    result = job.result()

    affected_rows = job.num_dml_affected_rows
    print(f"✅ Added {affected_rows} rows of properly deduplicated recent data")

    return affected_rows

def verify_data_quality():
    """Verify the data looks reasonable"""

    client = bigquery.Client()

    # Check overall stats
    check_query = """
    SELECT
      COUNT(*) as total_rows,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      SUM(cost) as total_cost,
      COUNT(DISTINCT date) as unique_dates
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    """

    job = client.query(check_query)
    results = list(job.result())

    for row in results:
        print(f"📊 Updated table summary:")
        print(f"   • Total rows: {row.total_rows:,}")
        print(f"   • Date range: {row.earliest_date} to {row.latest_date}")
        print(f"   • Total cost: ${row.total_cost:,.2f}")
        print(f"   • Unique dates: {row.unique_dates}")

    # Check recent data specifically
    recent_query = """
    SELECT
      data_source,
      COUNT(*) as rows,
      SUM(cost) as cost,
      COUNT(DISTINCT date) as dates
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    WHERE date > '2025-09-04'
    GROUP BY data_source
    ORDER BY cost DESC
    """

    job = client.query(recent_query)
    results = list(job.result())

    print(f"\n📅 Recent data (Sept 5+) by source:")
    for row in results:
        print(f"   • {row.data_source}: {row.rows} rows, ${row.cost:.2f}, {row.dates} dates")

    # Sample daily costs to see if they're reasonable
    daily_query = """
    SELECT
      date,
      SUM(cost) as daily_cost,
      COUNT(*) as records
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    WHERE date BETWEEN '2025-09-01' AND '2025-09-10'
    GROUP BY date
    ORDER BY date
    """

    job = client.query(daily_query)
    results = list(job.result())

    print(f"\n📈 Daily cost breakdown (Sep 1-10):")
    for row in results:
        print(f"   • {row.date}: ${row.daily_cost:.2f} ({row.records} records)")

def main():
    """Main function to fix the Amazon ads data correctly"""

    print("🚀 Fixing Amazon Ads Data - Correcting Duplicates")
    print("=" * 55)

    setup_environment()

    try:
        # Add recent data with proper deduplication
        rows_added = add_recent_data_correctly()

        if rows_added > 0:
            print(f"\n✅ Successfully added {rows_added} rows of recent data")

            # Verify the results look reasonable
            verify_data_quality()

            print(f"\n🎉 Data fix complete!")
            print(f"✅ Dashboard should now show reasonable Amazon ads numbers")
        else:
            print(f"\n⚠️  No new data was added - may need to investigate further")

    except Exception as e:
        print(f"❌ Error fixing data: {e}")
        return False

    return True

if __name__ == "__main__":
    main()