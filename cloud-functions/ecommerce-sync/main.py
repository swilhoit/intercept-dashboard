"""
Ecommerce daily sync function - Updates MASTER.TOTAL_DAILY_SALES with all channel data
"""
import json
import os
from datetime import datetime
from google.cloud import bigquery
import functions_framework

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

@functions_framework.http
def sync_ecommerce(request):
    """
    HTTP Cloud Function to sync ecommerce data daily
    Updates MASTER.TOTAL_DAILY_SALES with last 7 days of data from all platforms
    """
    print('Starting ecommerce daily sync...')
    client = bigquery.Client(project=PROJECT_ID)

    try:
        # Update MASTER table with all channel data (last 7 days)
        merge_query = f"""
        MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
        USING (
            WITH daily_amazon AS (
                SELECT
                    date,
                    ordered_product_sales as amazon_sales
                FROM `{PROJECT_ID}.amazon.daily_total_sales`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
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
                )
                GROUP BY order_date
            ),
            daily_shopify AS (
                SELECT
                    order_date as date,
                    SUM(total_revenue) as shopify_sales
                FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
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
            MAX(date) as latest_date,
            SUM(amazon_sales) as amazon_total,
            SUM(woocommerce_sales) as woo_total,
            SUM(shopify_sales) as shopify_total,
            SUM(total_sales) as grand_total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """

        verify_job = client.query(verify_query)
        result = list(verify_job.result())[0]

        print(f'Successfully updated {result.days_updated} days (latest: {result.latest_date})')
        print(f'Amazon: ${result.amazon_total or 0:,.2f}')
        print(f'WooCommerce: ${result.woo_total or 0:,.2f}')
        print(f'Shopify: ${result.shopify_total or 0:,.2f}')
        print(f'Total: ${result.grand_total or 0:,.2f}')

        return {
            'status': 'success',
            'days_updated': int(result.days_updated),
            'latest_date': str(result.latest_date),
            'amazon_total': float(result.amazon_total or 0),
            'woocommerce_total': float(result.woo_total or 0),
            'shopify_total': float(result.shopify_total or 0),
            'grand_total': float(result.grand_total or 0),
            'timestamp': datetime.now().isoformat(),
            'message': f'Ecommerce sync completed - {result.days_updated} days updated'
        }

    except Exception as e:
        print(f'Error in ecommerce sync: {e}')
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }, 500

def hello_world(request):
    """HTTP Cloud Function entry point"""
    return sync_ecommerce(request)