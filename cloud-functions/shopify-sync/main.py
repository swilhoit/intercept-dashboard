import os
import json
import requests
from datetime import datetime, timedelta, timezone
from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import functions_framework
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration from environment variables
SHOPIFY_ACCESS_TOKEN = os.environ.get('SHOPIFY_ACCESS_TOKEN')
SHOPIFY_SHOP_DOMAIN = os.environ.get('SHOPIFY_SHOP_DOMAIN')
PROJECT_ID = os.environ.get('GCP_PROJECT_ID', os.environ.get('GOOGLE_CLOUD_PROJECT'))
DATASET_ID = os.environ.get('BIGQUERY_DATASET', 'marketing_data')
TABLE_ID = 'shopify_waterwise_orders'

class ShopifyToBigQuery:
    def __init__(self):
        self.shopify_token = SHOPIFY_ACCESS_TOKEN
        self.shop_domain = SHOPIFY_SHOP_DOMAIN
        self.base_url = f"https://{SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01"
        self.headers = {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
        
        self.client = bigquery.Client(project=PROJECT_ID)
        self.table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"
    
    def fetch_orders(self, since_date=None, limit=250):
        all_orders = []
        params = {
            'limit': limit,
            'status': 'any'
        }
        
        if since_date:
            params['created_at_min'] = since_date
            
        url = f"{self.base_url}/orders.json"
        
        while url:
            response = requests.get(url, headers=self.headers, params=params)
            
            if response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 2))
                logger.warning(f"Rate limited. Waiting {retry_after} seconds...")
                import time
                time.sleep(retry_after)
                continue
                
            response.raise_for_status()
            data = response.json()
            orders = data.get('orders', [])
            all_orders.extend(orders)
            
            logger.info(f"Fetched {len(orders)} orders. Total: {len(all_orders)}")
            
            # Check for pagination
            link_header = response.headers.get('Link', '')
            url = None
            if link_header:
                links = link_header.split(',')
                for link in links:
                    if 'rel="next"' in link:
                        url = link.split('<')[1].split('>')[0]
                        params = {}  # Clear params for next page
                        break
        
        return all_orders
    
    def transform_order(self, order):
        transformed = {
            'order_id': str(order.get('id')),
            'order_number': order.get('order_number'),
            'created_at': order.get('created_at'),
            'updated_at': order.get('updated_at'),
            'processed_at': order.get('processed_at'),
            'customer_id': str(order.get('customer', {}).get('id', '')) if order.get('customer') else None,
            'email': order.get('email'),
            'financial_status': order.get('financial_status'),
            'fulfillment_status': order.get('fulfillment_status'),
            'currency': order.get('currency'),
            'total_price': float(order.get('total_price', 0)),
            'subtotal_price': float(order.get('subtotal_price', 0)),
            'total_tax': float(order.get('total_tax', 0)),
            'total_discounts': float(order.get('total_discounts', 0)),
            'total_shipping': float(order.get('total_shipping_price_set', {}).get('shop_money', {}).get('amount', 0)),
            'total_line_items_price': float(order.get('total_line_items_price', 0)),
            'line_items': json.dumps(order.get('line_items', [])),
            'shipping_address': json.dumps(order.get('shipping_address', {})),
            'billing_address': json.dumps(order.get('billing_address', {})),
            'customer': json.dumps(order.get('customer', {})),
            'tags': order.get('tags'),
            'note': order.get('note'),
            'cancelled_at': order.get('cancelled_at'),
            'cancel_reason': order.get('cancel_reason'),
            'source_name': order.get('source_name'),
            'referring_site': order.get('referring_site'),
            'landing_site': order.get('landing_site'),
            'browser_ip': order.get('browser_ip'),
            'user_agent': order.get('user_agent'),
            'discount_codes': json.dumps(order.get('discount_codes', [])),
            'sync_timestamp': datetime.now(timezone.utc).isoformat(),
        }
        
        # Extract product details
        product_ids = []
        product_titles = []
        product_quantities = []
        product_prices = []
        
        for item in order.get('line_items', []):
            product_ids.append(str(item.get('product_id', '')))
            product_titles.append(item.get('title', ''))
            product_quantities.append(item.get('quantity', 0))
            product_prices.append(float(item.get('price', 0)))
        
        transformed['product_ids'] = product_ids
        transformed['product_titles'] = product_titles
        transformed['product_quantities'] = product_quantities
        transformed['product_prices'] = product_prices
        
        return transformed
    
    def get_last_sync_date(self):
        """Get the date of the most recent order in BigQuery"""
        query = f"""
        SELECT MAX(created_at) as last_order_date
        FROM `{self.table_ref}`
        """
        try:
            result = self.client.query(query).result()
            for row in result:
                if row.last_order_date:
                    return row.last_order_date
        except Exception as e:
            logger.warning(f"Could not get last sync date: {e}")
        
        # Default to yesterday if no data exists
        return datetime.now(timezone.utc) - timedelta(days=1)
    
    def load_to_bigquery(self, orders):
        if not orders:
            logger.info("No orders to load")
            return
        
        transformed_orders = [self.transform_order(order) for order in orders]
        
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
            schema_update_options=[bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION],
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        )
        
        job = self.client.load_table_from_json(
            transformed_orders,
            self.table_ref,
            job_config=job_config
        )
        
        job.result()
        logger.info(f"Loaded {len(transformed_orders)} orders to BigQuery")
        
        return len(transformed_orders)
    
    def sync_recent_orders(self, days_back=2):
        """Sync orders from the last N days to handle any delays or updates"""
        since_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
        
        logger.info(f"Fetching orders since {since_date}")
        orders = self.fetch_orders(since_date=since_date)
        
        if orders:
            # Delete existing recent orders to avoid duplicates
            delete_query = f"""
            DELETE FROM `{self.table_ref}`
            WHERE created_at >= '{since_date}'
            """
            try:
                self.client.query(delete_query).result()
                logger.info(f"Deleted existing orders since {since_date}")
            except Exception as e:
                logger.warning(f"Could not delete existing orders: {e}")
            
            count = self.load_to_bigquery(orders)
            return count
        else:
            logger.info("No new orders to sync")
            return 0


@functions_framework.http
def sync_shopify_orders(request):
    """HTTP Cloud Function to sync Shopify orders to BigQuery"""
    try:
        # Parse request for optional parameters
        request_json = request.get_json(silent=True)
        days_back = 2  # Default to 2 days for updates
        
        if request_json and 'days_back' in request_json:
            days_back = int(request_json['days_back'])
        
        # Initialize connector and sync
        connector = ShopifyToBigQuery()
        orders_synced = connector.sync_recent_orders(days_back=days_back)
        
        response = {
            'status': 'success',
            'orders_synced': orders_synced,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        return json.dumps(response), 200
        
    except Exception as e:
        logger.error(f"Error syncing orders: {str(e)}")
        return json.dumps({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 500


@functions_framework.cloud_event
def sync_shopify_orders_pubsub(cloud_event):
    """Pub/Sub triggered Cloud Function to sync Shopify orders"""
    try:
        connector = ShopifyToBigQuery()
        orders_synced = connector.sync_recent_orders(days_back=2)
        
        logger.info(f"Successfully synced {orders_synced} orders via Pub/Sub trigger")
        
    except Exception as e:
        logger.error(f"Error syncing orders: {str(e)}")
        raise e


# WooCommerce sync function
@functions_framework.http
def sync_woocommerce_orders(request):
    """HTTP Cloud Function to sync WooCommerce orders with backfill"""
    try:
        from woocommerce import WooCommerceToBigQuery
        
        connector = WooCommerceToBigQuery()
        orders_synced = connector.sync_with_backfill()
        
        response = {
            'status': 'success',
            'orders_synced': orders_synced,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        return json.dumps(response), 200
        
    except Exception as e:
        logger.error(f"Error syncing WooCommerce orders: {str(e)}")
        return json.dumps({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 500


# Combined sync function
@functions_framework.http
@functions_framework.http
def update_ga4_attribution(request):
    """Update GA4 attribution data daily"""
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric
    )
    import pandas as pd
    
    analytics_client = BetaAnalyticsDataClient()
    client = bigquery.Client(project=PROJECT_ID)
    
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    properties = [
        {'id': '291259221', 'dataset': 'brick_anew_ga4'},
        {'id': '321103435', 'dataset': 'heatilator_ga4'}
    ]
    
    results = []
    for prop in properties:
        try:
            # Simple channel performance update
            request_obj = RunReportRequest(
                property=f"properties/{prop['id']}",
                dimensions=[
                    Dimension(name="date"),
                    Dimension(name="sessionDefaultChannelGrouping"),
                    Dimension(name="sessionSource")
                ],
                metrics=[
                    Metric(name="sessions"),
                    Metric(name="ecommercePurchases"),
                    Metric(name="purchaseRevenue")
                ],
                date_ranges=[DateRange(start_date=yesterday, end_date=yesterday)]
            )
            
            response = analytics_client.run_report(request_obj)
            
            data = []
            for row in response.rows:
                row_data = {}
                for i, dim in enumerate(row.dimension_values):
                    row_data[response.dimension_headers[i].name] = dim.value
                for i, metric in enumerate(row.metric_values):
                    row_data[response.metric_headers[i].name] = metric.value
                data.append(row_data)
            
            if data:
                df = pd.DataFrame(data)
                df['date'] = pd.to_datetime(df['date'], format='%Y%m%d')
                
                table_ref = f"{prop['dataset']}.attribution_channel_performance"
                job_config = bigquery.LoadJobConfig(write_disposition="WRITE_APPEND")
                job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
                job.result()
                
                results.append(f"Updated {prop['dataset']}: {len(data)} records")
                
        except Exception as e:
            results.append(f"Error {prop['dataset']}: {str(e)}")
    
    return {"status": "success", "results": results}

def sync_all_stores(request):
    """HTTP Cloud Function to sync both Shopify and WooCommerce orders"""
    from woocommerce import WooCommerceToBigQuery
    
    results = {
        'shopify': {'status': 'pending', 'orders_synced': 0},
        'woocommerce': {'status': 'pending', 'orders_synced': 0},
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    
    # Sync Shopify
    try:
        shopify_connector = ShopifyToBigQuery()
        shopify_orders = shopify_connector.sync_recent_orders(days_back=2)
        results['shopify'] = {
            'status': 'success',
            'orders_synced': shopify_orders
        }
        logger.info(f"Shopify sync successful: {shopify_orders} orders")
    except Exception as e:
        logger.error(f"Shopify sync failed: {str(e)}")
        results['shopify'] = {
            'status': 'error',
            'error': str(e)
        }
    
    # Sync WooCommerce with backfill
    try:
        wc_connector = WooCommerceToBigQuery()
        wc_orders = wc_connector.sync_with_backfill()
        results['woocommerce'] = {
            'status': 'success',
            'orders_synced': wc_orders
        }
        logger.info(f"WooCommerce sync successful: {wc_orders} orders")
    except Exception as e:
        logger.error(f"WooCommerce sync failed: {str(e)}")
        results['woocommerce'] = {
            'status': 'error',
            'error': str(e)
        }
    
    # Determine overall status
    if results['shopify']['status'] == 'success' and results['woocommerce']['status'] == 'success':
        status_code = 200
    elif results['shopify']['status'] == 'error' and results['woocommerce']['status'] == 'error':
        status_code = 500
    else:
        status_code = 206  # Partial success
    
    return json.dumps(results), status_code