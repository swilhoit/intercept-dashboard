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

# WooCommerce site configurations - CORRECTED credentials from .env.woocommerce
WOOCOMMERCE_SITES = {
    'brickanew': {
        'base_url': 'https://brick-anew.com',
        'consumer_key': 'ck_917c430be2a325d3ee74d809ca184726130d2fc2',
        'consumer_secret': 'cs_261e146b6578faf1c644e6bf1c3da9a5042abf86',
        'table': 'brickanew_daily_product_sales'
    },
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_662b9b92b3ad56d4e6a8104368081f7de3fecd4e',
        'consumer_secret': 'cs_b94be3803bacbf508eb774b1e414e3ed9cd21a85',
        'table': 'heatilator_daily_product_sales'
    },
    'superior': {
        'base_url': 'https://superiorfireplacedoors.com',
        'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
        'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1',
        'table': 'superior_daily_product_sales'
    },
    'majestic': {
        'base_url': 'https://majesticfireplacedoors.com',
        'consumer_key': 'ck_24fc09cea9514ee80496cdecefad84526c957662',
        'consumer_secret': 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a',
        'table': 'majestic_daily_product_sales'
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

    # Add headers to bypass Cloudflare/security plugins blocking Python requests
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }

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
        response = requests.get(url, auth=auth, params=params, headers=headers, timeout=30)
        
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
            response = requests.get(url, auth=auth, params=params, headers=headers, timeout=30)
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
    """Process orders and insert into BigQuery with deduplication and aggregation"""

    if not orders:
        return {'status': 'skipped', 'message': 'No orders to process'}

    client = bigquery.Client(project=PROJECT_ID)

    # Aggregate line items by (date, product_id, sku) to prevent duplicates
    aggregated_data = {}

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

            # Create unique key for aggregation
            key = (order_date.isoformat(), product_id, sku)

            if key not in aggregated_data:
                aggregated_data[key] = {
                    'order_date': order_date.isoformat(),
                    'product_id': product_id,
                    'product_name': product_name,
                    'sku': sku,
                    'total_quantity_sold': 0,
                    'total_revenue': 0,
                    'order_count': 0,
                    'unit_prices': []
                }

            # Aggregate the data
            aggregated_data[key]['total_quantity_sold'] += quantity
            aggregated_data[key]['total_revenue'] += total_price
            aggregated_data[key]['order_count'] += 1
            aggregated_data[key]['unit_prices'].append(unit_price)

    # Convert aggregated data to rows for insertion
    rows_to_insert = []
    for data in aggregated_data.values():
        # Calculate average unit price
        avg_unit_price = sum(data['unit_prices']) / len(data['unit_prices']) if data['unit_prices'] else 0

        rows_to_insert.append({
            'order_date': data['order_date'],
            'product_id': data['product_id'],
            'product_name': data['product_name'],
            'sku': data['sku'],
            'total_quantity_sold': data['total_quantity_sold'],
            'avg_unit_price': round(avg_unit_price, 2),
            'total_revenue': round(data['total_revenue'], 2),
            'order_count': data['order_count']
        })

    if rows_to_insert:
        try:
            table_id = f"{PROJECT_ID}.woocommerce.{table_name}"
            unique_dates = set(row['order_date'] for row in rows_to_insert)

            # Get dates to update
            date_list = "', '".join(unique_dates)

            # Create VALUES clause for new data
            values_list = []
            for row in rows_to_insert:
                values_list.append(f"""(
                    DATE('{row['order_date']}'),
                    {row['product_id']},
                    '{row['product_name'].replace("'", "''")}',
                    '{row['sku'].replace("'", "''")}',
                    {row['total_quantity_sold']},
                    {row['avg_unit_price']},
                    {row['total_revenue']},
                    {row['order_count']}
                )""")

            # Use CREATE OR REPLACE to bypass streaming buffer limitations
            # Keep existing data for dates NOT being updated, replace data for dates being updated
            replace_query = f"""
            CREATE OR REPLACE TABLE `{table_id}` AS
            SELECT * FROM (
                -- Keep existing data for dates NOT being updated
                SELECT *
                FROM `{table_id}`
                WHERE order_date NOT IN ('{date_list}')

                UNION ALL

                -- Add new/updated data for these dates
                SELECT * FROM UNNEST([
                    STRUCT<order_date DATE, product_id INT64, product_name STRING, sku STRING,
                           total_quantity_sold INT64, avg_unit_price FLOAT64, total_revenue FLOAT64, order_count INT64>
                    {', '.join(values_list)}
                ])
            )
            """

            replace_job = client.query(replace_query)
            replace_job.result()

            return {
                'status': 'success',
                'message': f'Updated {len(rows_to_insert)} rows for {site_name} across {len(unique_dates)} dates (deduplicated)'
            }

        except Exception as e:
            return {'status': 'error', 'message': f'BigQuery error for {site_name}: {str(e)}'}

    return {'status': 'skipped', 'message': 'No product data to insert'}

def fetch_all_woocommerce(request):
    """
    HTTP Cloud Function to fetch data from all WooCommerce sites
    Supports ?days_back=N parameter for backfilling historical data
    """
    try:
        # Get days_back parameter from request (default 7)
        days_back = 7
        if request.args and 'days_back' in request.args:
            try:
                days_back = int(request.args.get('days_back'))
            except ValueError:
                days_back = 7

        results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': PROJECT_ID,
            'days_back': days_back,
            'sites': {}
        }

        # Process each site
        for site_name, site_config in WOOCOMMERCE_SITES.items():
            print(f"Processing {site_name} (fetching {days_back} days)...")

            # Fetch orders with specified days_back
            fetch_result = fetch_woocommerce_orders(site_name, site_config, days_back=days_back)
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