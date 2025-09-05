#!/usr/bin/env python3

import json
import sys
from google.cloud import bigquery
from datetime import datetime, date
import os
from collections import defaultdict

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# WooCommerce site configurations
WOOCOMMERCE_SITES = {
    'brickanew': {
        'table': 'brickanew_daily_product_sales',
        'data_file': '/tmp/woo_recent_brickanew.json',
        'consumer_key': 'existing_key'  # Already integrated
    },
    'heatilator': {
        'table': 'heatilator_daily_product_sales',
        'data_file': '/tmp/woo_recent_heatilator.json',
        'consumer_key': 'ck_b7954d336fa5cbdc4981bb0dcdb3219b7af8cc90'
    },
    'superior': {
        'table': 'superior_daily_product_sales',
        'data_file': '/tmp/woo_recent_superior.json',
        'consumer_key': 'ck_fa744f3de5885bbc8e0520e8bee27a8db36b8eff'
    }
}

def process_site_orders(site_name, site_config):
    """Process orders for a specific WooCommerce site"""
    
    # Check if data file exists
    if not os.path.exists(site_config['data_file']):
        print(f"No data file found for {site_name}: {site_config['data_file']}")
        return {}
    
    # Read the orders JSON
    with open(site_config['data_file'], 'r') as f:
        orders = json.load(f)
    
    print(f"Processing {len(orders)} orders for {site_name}...")
    
    # Track daily totals for this site
    site_daily_totals = defaultdict(float)
    rows_to_insert = []
    
    for order in orders:
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        order_total = float(order['total'])
        
        # Skip orders older than August 15 (we want recent data)
        if order_date < date(2025, 8, 15):
            continue
            
        print(f"  Processing {site_name} order {order['id']} from {order_date}: ${order_total}")
        
        # Aggregate daily total for later MASTER table update
        site_daily_totals[order_date] += order_total
        
        # Process line items (products) for detailed table
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
    
    # Insert product data into BigQuery for this site
    if rows_to_insert:
        # Delete existing data for these dates first to avoid duplicates
        date_list = list(set(row['order_date'] for row in rows_to_insert))
        delete_existing_data_for_site(site_config['table'], date_list)
        
        # Insert new data
        table_ref = client.dataset('woocommerce').table(site_config['table'])
        try:
            errors = client.insert_rows_json(table_ref, rows_to_insert)
            if errors:
                print(f"Errors inserting {site_name} data: {errors}")
            else:
                print(f"Successfully inserted {len(rows_to_insert)} {site_name} product rows")
        except Exception as e:
            print(f"Error inserting {site_name} data: {e}")
            return {}
    
    return site_daily_totals

def delete_existing_data_for_site(table_name, date_list):
    """Delete existing data for specific dates to avoid duplicates"""
    if not date_list:
        return
        
    date_conditions = "', '".join(date_list)
    query = f"""
    DELETE FROM `intercept-sales-2508061117.woocommerce.{table_name}`
    WHERE order_date IN ('{date_conditions}')
    """
    
    try:
        job = client.query(query)
        job.result()  # Wait for completion
        print(f"Deleted existing {table_name} data for {len(date_list)} dates")
    except Exception as e:
        print(f"Error deleting existing {table_name} data: {e}")

def update_master_table(combined_daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with aggregated WooCommerce data from all sites"""
    
    for order_date, total_sales in combined_daily_totals.items():
        # Upsert into MASTER.TOTAL_DAILY_SALES
        query = f"""
        MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
        USING (SELECT DATE('{order_date}') as date, {total_sales} as woocommerce_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET 
            woocommerce_sales = S.woocommerce_sales,
            total_sales = S.woocommerce_sales + COALESCE(T.amazon_sales, 0)
        WHEN NOT MATCHED THEN
          INSERT (date, woocommerce_sales, amazon_sales, total_sales)
          VALUES (S.date, S.woocommerce_sales, 0, S.woocommerce_sales)
        """
        
        try:
            job = client.query(query)
            job.result()  # Wait for completion
            print(f"Updated MASTER table for {order_date}: ${total_sales:.2f}")
        except Exception as e:
            print(f"Error updating MASTER table for {order_date}: {e}")

def process_all_woocommerce_sites():
    """Process all WooCommerce sites and combine data"""
    
    # Combined daily totals across all sites
    combined_daily_totals = defaultdict(float)
    
    # Process each site
    for site_name, site_config in WOOCOMMERCE_SITES.items():
        print(f"\n=== Processing {site_name.upper()} ===")
        site_totals = process_site_orders(site_name, site_config)
        
        # Add to combined totals
        for date_key, total in site_totals.items():
            combined_daily_totals[date_key] += total
    
    # Show combined daily totals
    print(f"\n=== COMBINED DAILY SALES TOTALS ===")
    for order_date in sorted(combined_daily_totals.keys(), reverse=True):
        print(f"  {order_date}: ${combined_daily_totals[order_date]:.2f}")
    
    # Update MASTER.TOTAL_DAILY_SALES with combined WooCommerce data
    if combined_daily_totals:
        update_master_table(combined_daily_totals)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Process specific site
        site_name = sys.argv[1]
        if site_name in WOOCOMMERCE_SITES:
            site_config = WOOCOMMERCE_SITES[site_name]
            site_totals = process_site_orders(site_name, site_config)
            if site_totals:
                update_master_table(site_totals)
        else:
            print(f"Unknown site: {site_name}")
            print(f"Available sites: {list(WOOCOMMERCE_SITES.keys())}")
    else:
        # Process all sites
        process_all_woocommerce_sites()