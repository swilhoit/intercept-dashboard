#!/usr/bin/env python3

import pandas as pd
from google.cloud import bigquery
import sys
from datetime import datetime

def import_sales_tracking_data():
    """Import data from Sales Tracking 2010-2024 Excel file"""

    # Initialize BigQuery client
    client = bigquery.Client(project='intercept-sales-2508061117')
    table_id = 'intercept-sales-2508061117.waterwise.pre_shopify_orders'

    # Read the Excel file with all sheets
    sales_file = pd.ExcelFile('/Users/samwilhoit/Documents/sales-dashboard/ww - Sales Tracking 2010 - 2024 (3).xlsx')

    all_data = []

    for sheet_name in sales_file.sheet_names:
        print(f"Processing sheet: {sheet_name}")

        # Read the sheet
        df = pd.read_excel(sales_file, sheet_name=sheet_name)

        # Clean and standardize the data
        df_clean = df.copy()

        # Rename columns to match our schema
        column_mapping = {
            'Date': 'date',
            'Item': 'item_name',
            'State': 'state_region',
            'Price': 'price',
            'Qty': 'quantity',
            'Sales': 'sales_amount',
            'Shipping': 'shipping_amount',
            'Net': 'net_amount',
            'Tax': 'tax_amount',
            'Gross': 'gross_amount',
            'Notes': 'notes',
            'Tax.1': 'tax_status',
            'Leads': 'lead_source'
        }

        df_clean = df_clean.rename(columns=column_mapping)

        # Add metadata columns
        df_clean['year'] = int(sheet_name)
        df_clean['data_source'] = 'sales_tracking'
        df_clean['transaction_id'] = None
        df_clean['payment_method'] = 'Unknown'
        df_clean['customer_email'] = df_clean.get('lead_source', '')

        # Select only the columns that exist in our schema
        schema_columns = [
            'date', 'item_name', 'state_region', 'price', 'quantity',
            'sales_amount', 'shipping_amount', 'net_amount', 'tax_amount',
            'gross_amount', 'notes', 'tax_status', 'lead_source',
            'transaction_id', 'payment_method', 'customer_email', 'year', 'data_source'
        ]

        for col in schema_columns:
            if col not in df_clean.columns:
                df_clean[col] = None

        df_clean = df_clean[schema_columns]

        # Clean data types
        df_clean['date'] = pd.to_datetime(df_clean['date'], errors='coerce')
        df_clean['price'] = pd.to_numeric(df_clean['price'], errors='coerce')
        df_clean['quantity'] = pd.to_numeric(df_clean['quantity'], errors='coerce')
        df_clean['sales_amount'] = pd.to_numeric(df_clean['sales_amount'], errors='coerce')
        df_clean['shipping_amount'] = pd.to_numeric(df_clean['shipping_amount'], errors='coerce')
        df_clean['net_amount'] = pd.to_numeric(df_clean['net_amount'], errors='coerce')
        df_clean['tax_amount'] = pd.to_numeric(df_clean['tax_amount'], errors='coerce')
        df_clean['gross_amount'] = pd.to_numeric(df_clean['gross_amount'], errors='coerce')

        # Remove rows with null dates
        df_clean = df_clean.dropna(subset=['date'])

        print(f"Sheet {sheet_name}: {len(df_clean)} valid rows")
        all_data.append(df_clean)

    # Combine all data
    combined_df = pd.concat(all_data, ignore_index=True)
    print(f"Total sales tracking records: {len(combined_df)}")

    return combined_df

def import_paypal_data():
    """Import data from PayPal transactions Excel file"""

    # Read PayPal transactions
    paypal_df = pd.read_excel('/Users/samwilhoit/Documents/sales-dashboard/ww - Copy of Paypal All Transactions.xlsx')

    # Filter for sales transactions only
    sales_transactions = paypal_df[
        (paypal_df['Type'] == 'Payment') &
        (paypal_df['Status'] == 'Completed') &
        (paypal_df['Gross'] > 0)
    ].copy()

    print(f"PayPal sales transactions: {len(sales_transactions)}")

    if len(sales_transactions) == 0:
        return pd.DataFrame()

    # Map to our schema
    paypal_clean = pd.DataFrame()
    paypal_clean['date'] = pd.to_datetime(sales_transactions['Date'])
    paypal_clean['item_name'] = sales_transactions['Item Title']
    paypal_clean['state_region'] = sales_transactions['State/Province/Region/County/Territory/Prefecture/Republic']
    paypal_clean['price'] = sales_transactions['Gross']
    paypal_clean['quantity'] = sales_transactions['Quantity'].fillna(1)
    paypal_clean['sales_amount'] = sales_transactions['Gross']
    paypal_clean['shipping_amount'] = sales_transactions['Shipping and Handling Amount'].fillna(0)
    paypal_clean['net_amount'] = sales_transactions['Net']
    paypal_clean['tax_amount'] = sales_transactions['Sales Tax'].fillna(0)
    paypal_clean['gross_amount'] = sales_transactions['Gross']
    paypal_clean['notes'] = sales_transactions['Note']
    paypal_clean['tax_status'] = 'PayPal'
    paypal_clean['lead_source'] = sales_transactions['From Email Address']
    paypal_clean['transaction_id'] = sales_transactions['Transaction ID']
    paypal_clean['payment_method'] = 'PayPal'
    paypal_clean['customer_email'] = sales_transactions['From Email Address']
    paypal_clean['year'] = paypal_clean['date'].dt.year
    paypal_clean['data_source'] = 'paypal'

    return paypal_clean

def main():
    print("Starting WaterWise data import...")

    # Import sales tracking data
    sales_data = import_sales_tracking_data()

    # Import PayPal data
    paypal_data = import_paypal_data()

    # Combine all data
    if len(paypal_data) > 0:
        all_data = pd.concat([sales_data, paypal_data], ignore_index=True)
    else:
        all_data = sales_data

    print(f"Total records to import: {len(all_data)}")

    # Initialize BigQuery client
    client = bigquery.Client(project='intercept-sales-2508061117')
    table_id = 'intercept-sales-2508061117.waterwise.pre_shopify_orders'

    # Configure the load job
    job_config = bigquery.LoadJobConfig(
        write_disposition='WRITE_TRUNCATE',  # Replace existing data
        autodetect=False,
        schema=[
            bigquery.SchemaField('date', 'DATE'),
            bigquery.SchemaField('item_name', 'STRING'),
            bigquery.SchemaField('state_region', 'STRING'),
            bigquery.SchemaField('price', 'FLOAT'),
            bigquery.SchemaField('quantity', 'INTEGER'),
            bigquery.SchemaField('sales_amount', 'FLOAT'),
            bigquery.SchemaField('shipping_amount', 'FLOAT'),
            bigquery.SchemaField('net_amount', 'FLOAT'),
            bigquery.SchemaField('tax_amount', 'FLOAT'),
            bigquery.SchemaField('gross_amount', 'FLOAT'),
            bigquery.SchemaField('notes', 'STRING'),
            bigquery.SchemaField('tax_status', 'STRING'),
            bigquery.SchemaField('lead_source', 'STRING'),
            bigquery.SchemaField('transaction_id', 'STRING'),
            bigquery.SchemaField('payment_method', 'STRING'),
            bigquery.SchemaField('customer_email', 'STRING'),
            bigquery.SchemaField('year', 'INTEGER'),
            bigquery.SchemaField('data_source', 'STRING'),
        ]
    )

    # Load data to BigQuery
    print(f"Loading {len(all_data)} records to BigQuery...")
    job = client.load_table_from_dataframe(all_data, table_id, job_config=job_config)
    job.result()  # Wait for the job to complete

    print("Data import completed successfully!")

    # Show summary stats
    print("\nSummary by year:")
    year_summary = all_data.groupby('year').agg({
        'sales_amount': 'sum',
        'quantity': 'sum',
        'item_name': 'count'
    }).round(2)
    print(year_summary)

if __name__ == "__main__":
    main()