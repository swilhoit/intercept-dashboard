"""
Cloud Function to fetch WooCommerce data from all sites
"""
import json
import os
import requests
from datetime import datetime, date, timedelta
from google.cloud import bigquery
import time
import logging
from google.cloud.logging import Client as LoggingClient
from google.cloud.logging.handlers import CloudLoggingHandler, setup_logging

# --- Logging Configuration ---
# Use standard Python logging
# For Cloud Functions, this will go to Cloud Logging automatically
log = logging.getLogger()
log.setLevel(logging.INFO)

# --- GCP Configuration ---
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

# --- WooCommerce Site Configurations ---
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

def log_structured(severity, message, context=None):
    """Helper function to log structured data to Cloud Logging."""
    log_entry = {
        'message': message,
        'context': context or {},
    }
    log.log(severity, json.dumps(log_entry))


def fetch_woocommerce_orders(site_name, site_config, days_back=7, max_retries=3):
    """Fetch recent orders from a WooCommerce site with retry logic"""
    base_url = site_config['base_url']
    consumer_key = site_config['consumer_key']
    consumer_secret = site_config['consumer_secret']
    
    endpoint = f"{base_url}/wp-json/wc/v3/orders"
    
    # Calculate start date
    start_date = (datetime.utcnow() - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%S')

    params = {
        'consumer_key': consumer_key,
        'consumer_secret': consumer_secret,
        'after': start_date,
        'per_page': 100,
        'page': 1
    }

    all_orders = []
    
    for attempt in range(max_retries):
        try:
            while True:
                response = requests.get(endpoint, params=params, timeout=60)
                response.raise_for_status()  # Raises HTTPError for bad responses (4xx or 5xx)
                
                orders = response.json()
                
                if not orders:
                    break
                
                all_orders.extend(orders)
                params['page'] += 1
            
            # If loop completes without errors, return success
            return {
                'status': 'success',
                'site': site_name,
                'order_count': len(all_orders),
                'orders': all_orders,
                'days_back': days_back
            }

        except requests.exceptions.RequestException as e:
            logging.warning(f"Attempt {attempt + 1}/{max_retries} failed for {site_name}: {e}")
            if attempt + 1 == max_retries:
                # Last attempt failed, return error
                log_structured(
                    logging.ERROR,
                    f"Final fetch attempt failed for {site_name}",
                    {
                        "site": site_name,
                        "error": str(e),
                        "days_back": days_back,
                        "retries": max_retries
                    }
                )
                return {
                    'status': 'error',
                    'site': site_name,
                    'error': str(e),
                    'days_back': days_back,
                    'retries': max_retries
                }
            # Wait before retrying
            time.sleep(2 ** attempt) # Exponential backoff: 1, 2, 4 seconds
    
    # This part should not be reachable, but as a fallback:
    return {
        'status': 'error',
        'site': site_name,
        'error': 'Max retries reached without success',
        'days_back': days_back,
        'retries': max_retries
    }

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
                logging.warning("Invalid 'days_back' parameter, defaulting to 7.")

        results = {
            'timestamp': datetime.now().isoformat(),
            'project_id': PROJECT_ID,
            'days_back': days_back,
            'sites': {}
        }
        
        overall_status = 'success'
        error_count = 0

        # Process each site
        for site_name, site_config in WOOCOMMERCE_SITES.items():
            log.info(f"Processing {site_name} (fetching {days_back} days)...")

            # Fetch orders with specified days_back
            fetch_result = fetch_woocommerce_orders(site_name, site_config, days_back=days_back)
            results['sites'][site_name] = {'fetch': fetch_result}

            # If fetch successful, process to BigQuery
            if fetch_result['status'] == 'success':
                if fetch_result['order_count'] > 0:
                    process_result = process_orders_to_bigquery(
                        site_name,
                        fetch_result['orders'],
                        site_config['table']
                    )
                    results['sites'][site_name]['process'] = process_result
                    if process_result['status'] != 'success':
                        error_count += 1
                        log_structured(
                            logging.ERROR,
                            f"BigQuery processing failed for {site_name}",
                            {
                                "site": site_name,
                                "error": process_result.get('message'),
                                "details": process_result.get('errors')
                            }
                        )
                else:
                    process_result = {'status': 'skipped', 'message': 'No new orders to process'}
                    results['sites'][site_name]['process'] = process_result
                    log.info(f"No new orders for {site_name}, skipping BigQuery processing.")
            else:
                error_count += 1
                # The detailed error is already logged inside fetch_woocommerce_orders
                results['sites'][site_name]['process'] = {
                    'status': 'skipped',
                    'message': 'Fetch failed'
                }
        
        if error_count > 0:
            overall_status = 'partial_failure' if error_count < len(WOOCOMMERCE_SITES) else 'total_failure'
        
        results['overall_status'] = overall_status
        log_structured(
            logging.INFO if overall_status == 'success' else logging.WARNING,
            f"Completed WooCommerce sync with status: {overall_status}",
            {
                "final_status": overall_status,
                "total_sites": len(WOOCOMMERCE_SITES),
                "successful_sites": len(WOOCOMMERCE_SITES) - error_count,
                "failed_sites": error_count,
                "days_back": days_back
            }
        )

        return json.dumps(results, indent=2)
        
    except Exception as e:
        log_structured(
            logging.CRITICAL,
            "An unexpected error occurred in the main handler",
            {"error": str(e)}
        )
        return json.dumps({
            'timestamp': datetime.now().isoformat(),
            'status': 'error',
            'error': str(e),
            'project_id': PROJECT_ID
        }, indent=2)

def hello_world(request):
    """HTTP Cloud Function entry point"""
    return fetch_all_woocommerce(request)