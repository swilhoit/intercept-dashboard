#!/usr/bin/env python3

import json
import sys
from google.cloud import bigquery
from datetime import datetime
import os

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

def process_woocommerce_orders():
    # Read the orders JSON
    with open('/tmp/woo_orders.json', 'r') as f:
        orders = json.load(f)
    
    print(f"Processing {len(orders)} orders...")
    
    # Process each order and extract product sales data
    rows_to_insert = []
    
    for order in orders:
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        order_total = float(order['total'])
        
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
            
            print(f"  - {product_name}: ${total_price} ({quantity} units)")
    
    if rows_to_insert:
        # Insert into BigQuery
        table_ref = client.dataset('woocommerce').table('brickanew_daily_product_sales')
        
        try:
            errors = client.insert_rows_json(table_ref, rows_to_insert)
            if errors:
                print(f"Errors inserting data: {errors}")
            else:
                print(f"Successfully inserted {len(rows_to_insert)} product rows")
                
                # Update MASTER.TOTAL_DAILY_SALES
                update_master_table(rows_to_insert)
        except Exception as e:
            print(f"Error inserting data: {e}")
    else:
        print("No product data to insert")

def update_master_table(product_rows):
    """Update MASTER.TOTAL_DAILY_SALES with aggregated WooCommerce data"""
    
    # Aggregate by date
    daily_totals = {}
    for row in product_rows:
        date = row['order_date']
        if date not in daily_totals:
            daily_totals[date] = 0
        daily_totals[date] += row['total_revenue']
    
    for date, total_sales in daily_totals.items():
        # Upsert into MASTER.TOTAL_DAILY_SALES
        query = f"""
        MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
        USING (SELECT DATE('{date}') as date, {total_sales} as woocommerce_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET woocommerce_sales = S.woocommerce_sales
        WHEN NOT MATCHED THEN
          INSERT (date, woocommerce_sales, amazon_sales, total_sales)
          VALUES (S.date, S.woocommerce_sales, 0, S.woocommerce_sales)
        """
        
        try:
            job = client.query(query)
            job.result()  # Wait for completion
            print(f"Updated MASTER table for {date}: ${total_sales}")
        except Exception as e:
            print(f"Error updating MASTER table for {date}: {e}")

if __name__ == "__main__":
    process_woocommerce_orders()