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

def process_all_recent_orders():
    """Process all recent WooCommerce orders and update missing data"""
    
    # Read the comprehensive orders JSON
    with open('/tmp/woo_recent_all.json', 'r') as f:
        orders = json.load(f)
    
    print(f"Processing {len(orders)} total orders...")
    
    # Track daily totals for date range checking
    daily_totals = defaultdict(float)
    rows_to_insert = []
    
    # Current date for comparison
    today = date.today()
    
    for order in orders:
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        order_total = float(order['total'])
        
        # Skip orders older than August 15 (we want recent data)
        if order_date < date(2025, 8, 15):
            continue
            
        print(f"Processing order {order['id']} from {order_date}: ${order_total}")
        
        # Aggregate daily total for later MASTER table update
        daily_totals[order_date] += order_total
        
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
    
    print(f"\\nDaily sales totals found:")
    for order_date in sorted(daily_totals.keys(), reverse=True):
        print(f"  {order_date}: ${daily_totals[order_date]:.2f}")
    
    # Insert product data into BigQuery (if any new data)
    if rows_to_insert:
        # Delete existing data for these dates first to avoid duplicates
        date_list = list(set(row['order_date'] for row in rows_to_insert))
        delete_existing_data(date_list)
        
        # Insert new data
        table_ref = client.dataset('woocommerce').table('brickanew_daily_product_sales')
        try:
            errors = client.insert_rows_json(table_ref, rows_to_insert)
            if errors:
                print(f"Errors inserting data: {errors}")
            else:
                print(f"\\nSuccessfully inserted {len(rows_to_insert)} product rows")
        except Exception as e:
            print(f"Error inserting data: {e}")
            return
    
    # Update MASTER.TOTAL_DAILY_SALES with daily totals
    update_master_table(daily_totals)

def delete_existing_data(date_list):
    """Delete existing data for specific dates to avoid duplicates"""
    if not date_list:
        return
        
    date_conditions = "', '".join(date_list)
    query = f"""
    DELETE FROM `intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales`
    WHERE order_date IN ('{date_conditions}')
    """
    
    try:
        job = client.query(query)
        job.result()  # Wait for completion
        print(f"Deleted existing data for {len(date_list)} dates")
    except Exception as e:
        print(f"Error deleting existing data: {e}")

def update_master_table(daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with aggregated WooCommerce data"""
    
    for order_date, total_sales in daily_totals.items():
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

if __name__ == "__main__":
    process_all_recent_orders()