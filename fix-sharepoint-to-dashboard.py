#!/usr/bin/env python3
"""
Fix SharePoint sync by adding correctly transformed recent data to keywords_enhanced table
"""

import os
import requests
import json
from google.cloud import bigquery
from datetime import datetime, date

def setup_environment():
    """Load environment variables"""
    env_file = '.env.local'
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value.strip('"')

def get_sharepoint_data():
    """Get transformed data from our SharePoint sync service"""

    print("🔄 Fetching recent SharePoint data...")

    # Call our local sync service to get the transformed data
    try:
        response = requests.post('http://localhost:3006/api/sync/scheduled',
                               headers={'Content-Type': 'application/json'},
                               timeout=30)

        if response.status_code == 200:
            data = response.json()
            print(f"✅ Sync completed: {data}")
            return True
        else:
            print(f"❌ Sync failed: {response.status_code} - {response.text}")
            return False

    except Exception as e:
        print(f"❌ Error calling sync service: {e}")
        return False

def add_recent_data_to_dashboard():
    """Add recent SharePoint data directly to keywords_enhanced table"""

    client = bigquery.Client()

    print("🔄 Adding recent SharePoint data to keywords_enhanced table...")

    # Get recent data from the conversions_orders table (which already has transformed data)
    insert_query = """
    INSERT INTO `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
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
      'sharepoint_recent' as data_source,
      -- Calculated fields
      CASE WHEN clicks > 0 THEN ROUND(cost / clicks, 4) ELSE 0 END as cpc,
      CASE WHEN impressions > 0 THEN ROUND((clicks * 100.0) / impressions, 4) ELSE 0 END as ctr,
      CASE WHEN clicks > 0 THEN ROUND((conversions_1d_total * 100.0) / clicks, 4) ELSE NULL END as conversion_rate_1d_total,
      CASE WHEN clicks > 0 THEN ROUND((conversions_1d_sku * 100.0) / clicks, 4) ELSE NULL END as conversion_rate_1d_sku,
      FALSE as has_keyword_data,
      FALSE as has_search_term,
      clicks > 0 OR impressions > 0 OR cost > 0 as has_performance,
      EXTRACT(YEAR FROM date) as year,
      EXTRACT(MONTH FROM date) as month,
      EXTRACT(DAY FROM date) as day,
      EXTRACT(DAYOFWEEK FROM date) as weekday
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders`
    WHERE date IS NOT NULL
      AND campaign_id IS NOT NULL
      AND date >= '2025-09-04'
      AND (clicks > 0 OR impressions > 0 OR cost > 0)
    """

    try:
        job = client.query(insert_query)
        result = job.result()

        affected_rows = job.num_dml_affected_rows
        print(f"✅ Added {affected_rows} rows of recent SharePoint data to dashboard")

        return affected_rows > 0

    except Exception as e:
        print(f"❌ Error adding data to keywords_enhanced: {e}")
        return False

def verify_dashboard_data():
    """Verify the dashboard now has recent data"""

    client = bigquery.Client()

    # Check recent data in keywords_enhanced
    check_query = """
    SELECT
      COUNT(*) as total_rows,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      COUNT(DISTINCT date) as unique_dates,
      SUM(cost) as total_cost
    FROM `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced`
    WHERE date >= '2025-09-05'
    """

    job = client.query(check_query)
    results = list(job.result())

    for row in results:
        print(f"📊 Recent dashboard data (Sept 5+):")
        print(f"   • Total rows: {row.total_rows:,}")
        print(f"   • Date range: {row.earliest_date} to {row.latest_date}")
        print(f"   • Unique dates: {row.unique_dates}")
        print(f"   • Total cost: ${row.total_cost:,.2f}")

        if row.total_rows > 0 and row.latest_date >= date(2025, 10, 1):
            print(f"✅ Dashboard should now show recent Amazon ads data!")
            return True
        else:
            print(f"⚠️  Dashboard may still be missing recent data")
            return False

def main():
    """Main function to fix SharePoint sync for dashboard"""

    print("🚀 Fixing SharePoint Sync for Amazon Ads Dashboard")
    print("=" * 55)

    setup_environment()

    try:
        # Step 1: Get fresh SharePoint data via our sync service
        print("\nStep 1: Syncing fresh SharePoint data...")
        sync_success = get_sharepoint_data()

        if sync_success:
            # Step 2: Add the data to the dashboard table
            print("\nStep 2: Adding data to dashboard table...")
            insert_success = add_recent_data_to_dashboard()

            if insert_success:
                # Step 3: Verify dashboard data
                print("\nStep 3: Verifying dashboard data...")
                verify_success = verify_dashboard_data()

                if verify_success:
                    print(f"\n🎉 SharePoint sync fix complete!")
                    print(f"✅ Amazon ads dashboard should now show recent data")
                    print(f"🔗 Dashboard should display data through October 2025")
                    return True
                else:
                    print(f"\n⚠️  Sync completed but dashboard verification failed")
                    return False
            else:
                print(f"\n❌ Failed to add data to dashboard table")
                return False
        else:
            print(f"\n❌ Failed to sync SharePoint data")
            return False

    except Exception as e:
        print(f"\n❌ Error fixing SharePoint sync: {e}")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)