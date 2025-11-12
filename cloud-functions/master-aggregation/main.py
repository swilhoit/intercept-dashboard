"""
Master aggregation cloud function
Updates MASTER.TOTAL_DAILY_SALES with all channel data
"""

import os
from datetime import datetime
from google.cloud import bigquery
import functions_framework
import base64
import json

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

# --- Configuration for data freshness checks ---
# Max days since the last update for a source table to be considered "fresh"
SOURCE_FRESHNESS_THRESHOLDS = {
    'amazon_seller.amazon_orders_2025': 2,
    'amazon.orders_jan_2025_present': 2,
    'woocommerce.brickanew_daily_product_sales': 2,
    'woocommerce.heatilator_daily_product_sales': 2,
    'woocommerce.superior_daily_product_sales': 5, # Lower volume site
    'woocommerce.majestic_daily_product_sales': 5, # Lower volume site
    'woocommerce.waterwise_daily_product_sales': 3,
    'shopify.waterwise_daily_product_sales_clean': 3,
}

# Date columns for each table
DATE_COLUMNS = {
    'amazon_seller.amazon_orders_2025': 'Date',
    'amazon.orders_jan_2025_present': 'date',
    'woocommerce.brickanew_daily_product_sales': 'order_date',
    'woocommerce.heatilator_daily_product_sales': 'order_date',
    'woocommerce.superior_daily_product_sales': 'order_date',
    'woocommerce.majestic_daily_product_sales': 'order_date',
    'woocommerce.waterwise_daily_product_sales': 'order_date',
    'shopify.waterwise_daily_product_sales_clean': 'order_date',
}

def check_source_freshness(client):
    """Checks if all source tables have been updated recently."""
    stale_sources = []
    for table_id, max_days in SOURCE_FRESHNESS_THRESHOLDS.items():
        date_column = DATE_COLUMNS.get(table_id)
        if not date_column:
            stale_sources.append({'table': table_id, 'reason': 'Date column not configured'})
            continue

        query = f"""
            SELECT MAX({date_column}) as last_update
            FROM `{PROJECT_ID}.{table_id}`
        """
        try:
            result = list(client.query(query).result())
            last_update = result[0]['last_update']

            if not last_update:
                stale_sources.append({'table': table_id, 'reason': 'No data found'})
                continue
            
            # Convert to datetime.date if it's a string or datetime object
            if isinstance(last_update, str):
                last_update_date = datetime.strptime(last_update, '%Y-%m-%d').date()
            elif isinstance(last_update, datetime):
                last_update_date = last_update.date()
            else:
                last_update_date = last_update

            days_since_update = (datetime.now().date() - last_update_date).days
            
            if days_since_update > max_days:
                stale_sources.append({
                    'table': table_id, 
                    'reason': f'Last update was {days_since_update} days ago (threshold: {max_days})',
                    'last_update': str(last_update_date)
                })
        except Exception as e:
            stale_sources.append({'table': table_id, 'reason': f'Query failed: {str(e)}'})

    return stale_sources


@functions_framework.cloud_event
def master_aggregation(cloud_event):
    """
    Cloud Function triggered by Pub/Sub to update master aggregation.
    """
    # Extract message data
    try:
        message_data = json.loads(base64.b64decode(cloud_event.data["message"]["data"]).decode('utf-8'))
        print(f"Received Pub/Sub message: {message_data}")
        source = message_data.get("source")
    except Exception as e:
        print(f"Error decoding Pub/Sub message: {e}")
        # Acknowledge the message to prevent retries for malformed data
        return
    
    print(f'Starting master aggregation update, triggered by: {source or "Unknown"}...')
    client = bigquery.Client(project=PROJECT_ID)
    
    # 1. Check source data freshness
    stale_sources = check_source_freshness(client)
    if stale_sources:
        error_message = f"Master aggregation skipped. Stale data sources detected: {stale_sources}"
        print(error_message)
        # In a Pub/Sub function, we don't return an error code,
        # but logging is crucial for monitoring.
        # The message is acknowledged and not retried.
        return

    try:
        # 2. Update MASTER table with all channel data
        merge_query = f"""
        MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
        USING (
            WITH daily_amazon AS (
                -- Combine both Amazon data sources for complete revenue
                SELECT
                    order_date as date,
                    SUM(revenue) as amazon_sales
                FROM (
                    -- Amazon Seller Central data
                    SELECT
                        CASE
                            WHEN REGEXP_CONTAINS(Date, r'^\\d{{4}}-\\d{{2}}-\\d{{2}}$') THEN PARSE_DATE('%Y-%m-%d', Date)
                            WHEN REGEXP_CONTAINS(Date, r'^\\d+$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
                            ELSE NULL
                        END as order_date,
                        Item_Price as revenue
                    FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
                    WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0

                    UNION ALL

                    -- Historical Amazon orders data
                    SELECT
                        DATE(date) as order_date,
                        revenue
                    FROM `{PROJECT_ID}.amazon.orders_jan_2025_present`
                    WHERE product_name IS NOT NULL AND revenue IS NOT NULL AND revenue > 0
                )
                WHERE order_date IS NOT NULL
                    AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                GROUP BY order_date
            ),
            daily_woo AS (
                SELECT
                    order_date as date,
                    SUM(total_revenue) as woocommerce_sales
                FROM (
                    SELECT order_date, total_revenue
                    FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
                    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)

                    UNION ALL

                    SELECT order_date, total_revenue
                    FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
                    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)

                    UNION ALL

                    SELECT order_date, total_revenue
                    FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
                    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)

                    UNION ALL

                    SELECT order_date, total_revenue
                    FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales`
                    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)

                    UNION ALL

                    SELECT order_date, total_revenue
                    FROM `{PROJECT_ID}.woocommerce.waterwise_daily_product_sales`
                    WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                )
                GROUP BY order_date
            ),
            daily_shopify AS (
                SELECT
                    order_date as date,
                    SUM(total_revenue) as shopify_sales
                FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales_clean`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                GROUP BY order_date
            )
            SELECT
                COALESCE(a.date, w.date, s.date) as date,
                COALESCE(a.amazon_sales, 0) as amazon_sales,
                COALESCE(w.woocommerce_sales, 0) as woocommerce_sales,
                COALESCE(s.shopify_sales, 0) as shopify_sales,
                COALESCE(a.amazon_sales, 0) + COALESCE(w.woocommerce_sales, 0) + COALESCE(s.shopify_sales, 0) as total_sales
            FROM daily_amazon a
            FULL OUTER JOIN daily_woo w ON a.date = w.date
            FULL OUTER JOIN daily_shopify s ON COALESCE(a.date, w.date) = s.date
            WHERE COALESCE(a.date, w.date, s.date) IS NOT NULL
        ) AS daily
        ON master.date = daily.date
        WHEN MATCHED THEN
            UPDATE SET 
                amazon_sales = daily.amazon_sales,
                woocommerce_sales = daily.woocommerce_sales,
                shopify_sales = daily.shopify_sales,
                total_sales = daily.total_sales,
                created_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
            INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
            VALUES (
                daily.date,
                daily.amazon_sales,
                daily.woocommerce_sales,
                daily.shopify_sales,
                daily.total_sales,
                'USD',
                CURRENT_TIMESTAMP()
            )
        """
        
        merge_job = client.query(merge_query)
        merge_job.result()
        
        # Verify results
        verify_query = f"""
        SELECT 
            COUNT(*) as days_updated,
            SUM(amazon_sales) as amazon_total,
            SUM(woocommerce_sales) as woo_total,
            SUM(total_sales) as grand_total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        verify_job = client.query(verify_query)
        result = list(verify_job.result())[0]
        
        success_message = f"Master aggregation successful. Days updated: {result['days_updated']}"
        print(success_message)
        # No return value needed for success in a Pub/Sub trigger
        
    except Exception as e:
        error_message = f"Error during master aggregation: {e}"
        print(error_message)
        # Re-raise the exception to signal failure to Cloud Functions.
        # This will cause the message to be re-delivered (depending on topic settings).
        raise