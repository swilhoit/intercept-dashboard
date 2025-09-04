"""
Fixed ecommerce daily sync function with proper environment variables
"""
import json
import os
from datetime import datetime, timedelta
from google.cloud import bigquery
import requests

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

def sync_ecommerce(request):
    """
    HTTP Cloud Function to sync ecommerce data daily
    """
    try:
        # Initialize BigQuery client with proper project ID
        client = bigquery.Client(project=PROJECT_ID)
        
        results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': PROJECT_ID,
            'shopify': {'status': 'skipped', 'message': 'Shopify sync would run here'},
            'woocommerce': {'status': 'skipped', 'message': 'WooCommerce sync would run here'},
            'amazon': {'status': 'skipped', 'message': 'Amazon sync would run here'},
            'summary_update': {'status': 'pending', 'message': 'Will update summary tables'}
        }
        
        # Update the TOTAL_DAILY_SALES summary table
        # This would normally aggregate from individual platform tables
        update_summary_query = f"""
        INSERT INTO `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` (date, amazon_sales, woocommerce_sales, total_sales)
        SELECT 
            CURRENT_DATE() as date,
            COALESCE(SUM(CASE WHEN channel = 'Amazon' THEN total_revenue ELSE 0 END), 0) as amazon_sales,
            COALESCE(SUM(CASE WHEN channel = 'WooCommerce' THEN total_revenue ELSE 0 END), 0) as woocommerce_sales,
            COALESCE(SUM(total_revenue), 0) as total_sales
        FROM (
            -- Amazon data from existing table
            SELECT 'Amazon' as channel, SUM(Item_Price) as total_revenue
            FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
            WHERE DATE(PARSE_DATE('%Y%m%d', CAST(CAST(Date AS INT64) AS STRING))) = CURRENT_DATE()
            
            UNION ALL
            
            -- WooCommerce data from existing table
            SELECT 'WooCommerce' as channel, SUM(total_revenue) as total_revenue
            FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
            WHERE order_date = CURRENT_DATE()
        )
        WHERE NOT EXISTS (
            SELECT 1 FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
            WHERE date = CURRENT_DATE()
        )
        """
        
        try:
            # Run the summary update query
            job = client.query(update_summary_query)
            job.result()  # Wait for completion
            
            results['summary_update'] = {
                'status': 'success',
                'message': f'Updated summary for {datetime.now().date()}'
            }
            
        except Exception as e:
            results['summary_update'] = {
                'status': 'error', 
                'error': str(e)
            }
        
        return json.dumps(results, indent=2)
        
    except Exception as e:
        return json.dumps({
            'timestamp': datetime.now().isoformat(),
            'status': 'error',
            'error': str(e),
            'project_id': PROJECT_ID
        }, indent=2)

def hello_world(request):
    """HTTP Cloud Function entry point"""
    return sync_ecommerce(request)