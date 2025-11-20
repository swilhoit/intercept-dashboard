#!/usr/bin/env python3
"""
Fix Amazon data in MASTER table using deduplicated data
"""

import os
from google.cloud import bigquery
from datetime import datetime

# Configure BigQuery
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def update_master_with_deduplicated_amazon():
    """Update MASTER.TOTAL_DAILY_SALES with deduplicated Amazon data"""

    print("Updating MASTER table with deduplicated Amazon data...")

    query = f"""
    -- Update Amazon sales in MASTER table with deduplicated data
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        WITH combined_amazon AS (
          -- Deduplicated data from both Amazon sources
          SELECT DISTINCT
            product_name,
            revenue,
            order_date
          FROM (
            -- Recent data from amazon_seller table
            SELECT
              Product_Name as product_name,
              Item_Price as revenue,
              CASE
                WHEN REGEXP_CONTAINS(Date, r'^\\d{{4}}-\\d{{2}}-\\d{{2}}$') THEN PARSE_DATE('%Y-%m-%d', Date)
                WHEN REGEXP_CONTAINS(Date, r'^\\d+$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
                ELSE NULL
              END as order_date
            FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
            WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0

            UNION ALL

            -- Historical data from amazon orders table
            SELECT
              product_name,
              revenue,
              DATE(date) as order_date
            FROM `{PROJECT_ID}.amazon.orders_jan_2025_present`
            WHERE product_name IS NOT NULL AND revenue IS NOT NULL AND revenue > 0
          )
        )
        SELECT
          order_date as date,
          SUM(revenue) as amazon_sales
        FROM combined_amazon
        WHERE order_date IS NOT NULL
        GROUP BY order_date
    ) AS amazon
    ON master.date = amazon.date
    WHEN MATCHED THEN
        UPDATE SET
            amazon_sales = amazon.amazon_sales,
            total_sales = COALESCE(amazon.amazon_sales, 0) +
                         COALESCE(master.woocommerce_sales, 0) +
                         COALESCE(master.shopify_sales, 0),
            created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
        VALUES (
            amazon.date,
            amazon.amazon_sales,
            0,
            0,
            amazon.amazon_sales,
            'USD',
            CURRENT_TIMESTAMP()
        );
    """

    try:
        job = client.query(query)
        results = job.result()

        # Verify the update
        verify_query = f"""
        SELECT
            COUNT(*) as days_with_data,
            SUM(amazon_sales) as total_amazon,
            SUM(total_sales) as grand_total,
            MIN(date) as earliest_date,
            MAX(date) as latest_date
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE amazon_sales > 0
        """

        verify_job = client.query(verify_query)
        for row in verify_job.result():
            print(f"✅ MASTER table updated with deduplicated data:")
            print(f"   - Days with Amazon data: {row.days_with_data}")
            print(f"   - Date range: {row.earliest_date} to {row.latest_date}")
            print(f"   - Total Amazon sales: ${row.total_amazon:,.2f}")
            print(f"   - Grand total sales: ${row.grand_total:,.2f}")

    except Exception as e:
        print(f"❌ Error updating MASTER table: {e}")
        return False

    return True

def show_before_after_comparison():
    """Show comparison of old vs new Amazon data"""

    print("\n" + "="*50)
    print("BEFORE vs AFTER COMPARISON")
    print("="*50)

    # Show what we corrected
    comparison_query = f"""
    WITH old_method AS (
      SELECT
        SUM(Item_Price) as old_amazon_total
      FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
      WHERE Date IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0
        AND CASE
          WHEN REGEXP_CONTAINS(Date, r'^\\d{{4}}-\\d{{2}}-\\d{{2}}$') THEN PARSE_DATE('%Y-%m-%d', Date)
          WHEN REGEXP_CONTAINS(Date, r'^\\d+$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
          ELSE NULL
        END >= '2025-01-01'
    ),
    new_method AS (
      SELECT
        SUM(amazon_sales) as new_amazon_total
      FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
      WHERE amazon_sales > 0 AND date >= '2025-01-01'
    )
    SELECT
      old_method.old_amazon_total,
      new_method.new_amazon_total,
      (old_method.old_amazon_total - new_method.new_amazon_total) as duplicate_amount_removed,
      ROUND(((old_method.old_amazon_total - new_method.new_amazon_total) / old_method.old_amazon_total) * 100, 1) as percent_duplicates
    FROM old_method, new_method
    """

    try:
        job = client.query(comparison_query)
        for row in job.result():
            print(f"📊 Data Correction Summary:")
            print(f"   - BEFORE (with duplicates): ${row.old_amazon_total:,.2f}")
            print(f"   - AFTER (deduplicated): ${row.new_amazon_total:,.2f}")
            print(f"   - Duplicate amount removed: ${row.duplicate_amount_removed:,.2f}")
            print(f"   - Duplicates were {row.percent_duplicates}% of total")

    except Exception as e:
        print(f"❌ Error running comparison: {e}")

if __name__ == "__main__":
    print("Starting Amazon duplicate data fix for MASTER table...")
    print(f"Project: {PROJECT_ID}")
    print("-" * 50)

    # Update MASTER table with deduplicated data
    if update_master_with_deduplicated_amazon():
        show_before_after_comparison()

    print("\n✅ Amazon duplicate fix complete!")
    print("\n🎯 The dashboard should now show corrected Amazon revenue!")