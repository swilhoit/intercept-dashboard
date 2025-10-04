"""
Cloud Function to fetch WooCommerce data from all sites
"""
import json
import os
import requests
from datetime import datetime, date, timedelta
from google.cloud import bigquery
import time

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

# WooCommerce site configurations - will need to be updated with actual credentials
WOOCOMMERCE_SITES = {
    'brickanew': {
        'base_url': 'https://brick-anew.com',
        'consumer_key': 'ck_917c430be2a325d3ee74d809ca184726130d2fc2',
        'consumer_secret': 'cs_261e146b6578faf1c644e6bf1c3da9a5042abf86',
        'table': 'brickanew_daily_product_sales'
    },
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_440a83e0aa324f7a0dcb10b07710239b1af741d0',
        'consumer_secret': 'cs_893f884fb20e5bc9c2655188c18c08debebf7bb7',
        'table': 'heatilator_daily_product_sales'
    },
    'superior': {
        'base_url': 'https://superiorfireplacedoors.com',
        'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
        'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1',
        'table': 'superior_daily_product_sales'
    }
}

def fetch_woocommerce_orders(site_name, site_config, days_back=7):
    """Fetch recent orders from a WooCommerce site"""
    
    if not all([site_config.get('base_url'), site_config.get('consumer_key'), site_config.get('consumer_secret')]):
        return {'status': 'skipped', 'message': f'Missing credentials for {site_name}'}
    
    base_url = site_config['base_url']
    consumer_key = site_config['consumer_key']
    consumer_secret = site_config['consumer_secret']
    
    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    
    # WooCommerce REST API endpoint
    url = f"{base_url}/wp-json/wc/v3/orders"
    auth = (consumer_key, consumer_secret)
    
    params = {
        'after': start_date.isoformat() + 'T00:00:00',
        'before': end_date.isoformat() + 'T23:59:59',
        'status': 'completed',
        'per_page': 100,
        'page': 1
    }
    
    all_orders = []
    
    try:
        # Fetch first page to test connection
        response = requests.get(url, auth=auth, params=params, timeout=30)
        
        if response.status_code == 401:
            return {'status': 'error', 'message': f'Authentication failed for {site_name}'}
        elif response.status_code == 404:
            return {'status': 'error', 'message': f'WooCommerce API not found for {site_name}'}
        elif response.status_code != 200:
            return {'status': 'error', 'message': f'HTTP {response.status_code} for {site_name}'}
        
        orders = response.json()
        all_orders.extend(orders)
        
        # Fetch additional pages if needed
        page = 2
        while len(orders) == 100 and page <= 10:  # Limit to 10 pages max
            params['page'] = page
            response = requests.get(url, auth=auth, params=params, timeout=30)
            if response.status_code == 200:
                orders = response.json()
                all_orders.extend(orders)
                page += 1
                time.sleep(0.5)  # Rate limiting
            else:
                break
        
        return {
            'status': 'success', 
            'message': f'Fetched {len(all_orders)} orders from {site_name}',
            'orders': all_orders
        }
        
    except Exception as e:
        return {'status': 'error', 'message': f'Failed to fetch {site_name} orders: {str(e)}'}

def process_orders_to_bigquery(site_name, orders, table_name):
    """Process orders and insert into BigQuery"""
    
    if not orders:
        return {'status': 'skipped', 'message': 'No orders to process'}
    
    client = bigquery.Client(project=PROJECT_ID)
    rows_to_insert = []
    
    for order in orders:
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        
        # Process line items (products)
        for item in order.get('line_items', []):
            product_id = item['product_id']
            product_name = item['name']
            sku = item.get('sku', '')
            quantity = item['quantity']
            total_price = float(item['total'])
            unit_price = total_price / quantity if quantity > 0 else 0
            
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
        # Delete existing data for today to avoid duplicates
        today = date.today().isoformat()
        delete_query = f"""
        DELETE FROM `{PROJECT_ID}.woocommerce.{table_name}`
        WHERE order_date = '{today}'
        """
        
        try:
            job = client.query(delete_query)
            job.result()
            
            # Insert new data
            table_ref = client.dataset('woocommerce').table(table_name)
            errors = client.insert_rows_json(table_ref, rows_to_insert)
            
            if errors:
                return {'status': 'error', 'message': f'BigQuery insert errors: {errors}'}
            else:
                return {
                    'status': 'success', 
                    'message': f'Inserted {len(rows_to_insert)} rows for {site_name}'
                }
                
        except Exception as e:
            return {'status': 'error', 'message': f'BigQuery error for {site_name}: {str(e)}'}
    
    return {'status': 'skipped', 'message': 'No product data to insert'}

def fetch_all_woocommerce(request):
    """
    HTTP Cloud Function to fetch data from all WooCommerce sites
    """
    try:
        results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': PROJECT_ID,
            'sites': {}
        }
        
        # Process each site
        for site_name, site_config in WOOCOMMERCE_SITES.items():
            print(f"Processing {site_name}...")
            
            # Fetch orders
            fetch_result = fetch_woocommerce_orders(site_name, site_config)
            results['sites'][site_name] = {'fetch': fetch_result}
            
            # If fetch successful, process to BigQuery
            if fetch_result['status'] == 'success':
                process_result = process_orders_to_bigquery(
                    site_name, 
                    fetch_result['orders'], 
                    site_config['table']
                )
                results['sites'][site_name]['process'] = process_result
            else:
                results['sites'][site_name]['process'] = {
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
    return fetch_all_woocommerce(request)