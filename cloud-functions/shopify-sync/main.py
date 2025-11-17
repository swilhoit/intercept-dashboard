"""
Cloud Function to fetch Shopify WaterWise data and sync to BigQuery
Matches WooCommerce sync pattern for consistency
"""
import json
import os
import requests
from datetime import datetime, date, timedelta
from google.cloud import bigquery
import time

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

# WaterWise Shopify configuration
SHOPIFY_CONFIG = {
    'shop_domain': os.environ.get('SHOPIFY_SHOP_DOMAIN', 'waterwisegroup.myshopify.com'),
    'access_token': os.environ.get('SHOPIFY_ACCESS_TOKEN', ''),
    'table': 'waterwise_daily_product_sales_clean'  # Write directly to clean table
}

def fetch_shopify_orders(days_back=7):
    """Fetch recent orders from WaterWise Shopify store"""

    shop_domain = SHOPIFY_CONFIG['shop_domain']
    access_token = SHOPIFY_CONFIG['access_token']

    if not access_token:
        return {'status': 'error', 'message': 'Missing Shopify access token'}

    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)

    # Shopify Admin API endpoint
    url = f"https://{shop_domain}/admin/api/2024-01/orders.json"

    headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
    }

    params = {
        'status': 'any',
        'created_at_min': start_date.isoformat() + 'T00:00:00-00:00',
        'created_at_max': end_date.isoformat() + 'T23:59:59-00:00',
        'limit': 250
    }

    all_orders = []

    try:
        # Fetch first page
        response = requests.get(url, headers=headers, params=params, timeout=30)

        if response.status_code == 401:
            return {'status': 'error', 'message': 'Authentication failed for WaterWise Shopify'}
        elif response.status_code == 404:
            return {'status': 'error', 'message': f'Shopify API not found for {shop_domain}'}
        elif response.status_code != 200:
            return {'status': 'error', 'message': f'HTTP {response.status_code} for WaterWise'}

        data = response.json()
        orders = data.get('orders', [])
        all_orders.extend(orders)

        # Handle pagination using Link header
        link_header = response.headers.get('Link', '')
        while link_header and 'rel="next"' in link_header:
            # Extract next URL from Link header
            next_url = None
            links = link_header.split(',')
            for link in links:
                if 'rel="next"' in link:
                    next_url = link.split('<')[1].split('>')[0]
                    break

            if not next_url:
                break

            time.sleep(0.5)  # Rate limiting
            response = requests.get(next_url, headers=headers, timeout=30)

            if response.status_code == 200:
                data = response.json()
                orders = data.get('orders', [])
                all_orders.extend(orders)
                link_header = response.headers.get('Link', '')
            else:
                break

        return {
            'status': 'success',
            'message': f'Fetched {len(all_orders)} orders from WaterWise',
            'orders': all_orders
        }

    except Exception as e:
        return {'status': 'error', 'message': f'Failed to fetch WaterWise orders: {str(e)}'}

def process_orders_to_bigquery(orders, table_name):
    """Process Shopify orders and insert into BigQuery with deduplication"""

    if not orders:
        return {'status': 'skipped', 'message': 'No orders to process'}

    client = bigquery.Client(project=PROJECT_ID)
    rows_to_insert = []

    for order in orders:
        order_date = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00')).date()

        # Process line items (products)
        for item in order.get('line_items', []):
            product_id = item.get('product_id', 0)
            product_name = item.get('title', 'Unknown Product')
            sku = item.get('sku', f'WW_{product_id}')
            quantity = item.get('quantity', 0)
            total_price = float(item.get('price', 0)) * quantity
            unit_price = float(item.get('price', 0))

            row = {
                'order_date': order_date.isoformat(),
                'product_id': product_id,
                'product_name': product_name,
                'sku': sku,
                'total_quantity_sold': quantity,
                'avg_unit_price': round(unit_price, 2),
                'total_revenue': round(total_price, 2),
                'order_count': 1
            }
            rows_to_insert.append(row)

    if rows_to_insert:
        try:
            # Get unique dates to delete
            unique_dates = set(row['order_date'] for row in rows_to_insert)
            date_list = "', '".join(unique_dates)

            # Delete existing data for these dates to prevent duplicates
            table_id = f"{PROJECT_ID}.shopify.{table_name}"
            delete_query = f"""
            DELETE FROM `{table_id}`
            WHERE order_date IN ('{date_list}')
            """

            delete_job = client.query(delete_query)
            delete_job.result()
            print(f"Deleted existing data for {len(unique_dates)} dates in WaterWise")

            # Now insert fresh data
            table_ref = client.dataset('shopify').table(table_name)
            errors = client.insert_rows_json(table_ref, rows_to_insert)

            if errors:
                return {'status': 'error', 'message': f'BigQuery insert errors: {errors}'}

            return {
                'status': 'success',
                'message': f'Inserted {len(rows_to_insert)} rows for WaterWise across {len(unique_dates)} dates (deduplicated)'
            }

        except Exception as e:
            return {'status': 'error', 'message': f'BigQuery error for WaterWise: {str(e)}'}

    return {'status': 'skipped', 'message': 'No product data to insert'}

def sync_shopify_waterwise(request):
    """
    HTTP Cloud Function to fetch data from WaterWise Shopify
    Supports ?days_back=N parameter for backfilling historical data
    """
    try:
        # Get days_back parameter from request (default 7)
        days_back = 7
        request_json = request.get_json(silent=True)
        if request_json and 'days_back' in request_json:
            try:
                days_back = int(request_json['days_back'])
            except ValueError:
                days_back = 7

        results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': PROJECT_ID,
            'days_back': days_back,
            'waterwise': {}
        }

        # Fetch WaterWise orders
        print(f"Processing WaterWise (fetching {days_back} days)...")
        fetch_result = fetch_shopify_orders(days_back=days_back)
        results['waterwise']['fetch'] = fetch_result

        # If fetch successful, process to BigQuery
        if fetch_result['status'] == 'success':
            process_result = process_orders_to_bigquery(
                fetch_result['orders'],
                SHOPIFY_CONFIG['table']
            )
            results['waterwise']['process'] = process_result
        else:
            results['waterwise']['process'] = {
                'status': 'skipped',
                'message': 'Fetch failed'
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
    return sync_shopify_waterwise(request)
