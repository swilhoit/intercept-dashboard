#!/usr/bin/env python3
"""
Amazon Returns SharePoint Sync
Downloads Amazon returns data from SharePoint Excel file and imports to BigQuery
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import numpy as np
import requests
import os
import sys
from io import BytesIO
import base64

# Configuration
PROJECT_ID = 'intercept-sales-2508061117'
DATASET_ID = 'amazon_seller'
TABLE_ID = 'returns'

# SharePoint file URL
SHAREPOINT_URL = 'https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BC0BF238B-1CDA-47FD-A968-087EE7A27270%7D&file=amazon%20returns.xlsx&action=default&mobileredirect=true'
FILE_ID = 'C0BF238B1CDA47FDA968087EE7A27270'

def get_access_token():
    """Get Microsoft Graph access token"""
    tenant_id = os.getenv("MICROSOFT_TENANT_ID")
    client_id = os.getenv("MICROSOFT_CLIENT_ID")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET")

    if not all([tenant_id, client_id, client_secret]):
        print("❌ Microsoft credentials not configured")
        print("Attempting to use local file if available...")
        return None

    try:
        auth_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        data = {
            'grant_type': 'client_credentials',
            'client_id': client_id,
            'client_secret': client_secret,
            'scope': 'https://graph.microsoft.com/.default'
        }

        response = requests.post(auth_url, headers=headers, data=data)
        response.raise_for_status()
        return response.json()['access_token']
    except Exception as e:
        print(f"❌ Error getting access token: {e}")
        return None

def download_sharepoint_excel(access_token=None):
    """Download Excel file from SharePoint"""
    print(f"Downloading Amazon returns from SharePoint...")

    # Try local file first
    local_filename = 'amazon returns.xlsx'
    if os.path.exists(local_filename):
        print(f"✅ Using local file: {local_filename}")
        return local_filename

    if not access_token:
        print(f"❌ No access token and no local file found")
        return None

    try:
        # Encode SharePoint URL for Microsoft Graph API
        base64_value = base64.b64encode(SHAREPOINT_URL.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        # Get shared item metadata
        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        shared_response = requests.get(shared_item_url, headers=headers)
        shared_response.raise_for_status()
        shared_item = shared_response.json()

        # Get download URL
        download_url = shared_item.get('@microsoft.graph.downloadUrl')
        
        if not download_url:
            print(f"❌ Could not get download URL from SharePoint")
            return None

        # Download file
        file_response = requests.get(download_url)
        file_response.raise_for_status()

        # Save temporarily
        with open(local_filename, 'wb') as f:
            f.write(file_response.content)

        print(f"✅ Downloaded from SharePoint: {local_filename}")
        return local_filename

    except Exception as e:
        print(f"❌ Error downloading from SharePoint: {e}")
        return None

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper datetime"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        # Excel counts from January 1, 1900 (with leap year bug)
        excel_epoch = datetime(1899, 12, 30)
        return excel_epoch + timedelta(days=int(float(serial_date)))
    except (ValueError, TypeError):
        try:
            # Try parsing as datetime string
            return pd.to_datetime(serial_date)
        except:
            return None

def process_returns_excel(file_path):
    """Process Amazon returns Excel file and prepare for BigQuery"""
    print(f"\n{'='*60}")
    print(f"Processing: {file_path}")
    print(f"{'='*60}")

    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return None

    try:
        # Read all sheets to find the data
        xl_file = pd.ExcelFile(file_path)
        print(f"Sheets in file: {xl_file.sheet_names}")

        # Try to read the first sheet or one named appropriately
        sheet_name = xl_file.sheet_names[0]
        if 'data' in [s.lower() for s in xl_file.sheet_names]:
            sheet_name = [s for s in xl_file.sheet_names if s.lower() == 'data'][0]
        
        print(f"Reading sheet: {sheet_name}")
        df = pd.read_excel(file_path, sheet_name=sheet_name)

        if df.empty or len(df) == 0:
            print(f"❌ No data in {file_path}")
            return None

        print(f"Original shape: {df.shape}")
        print(f"Original columns: {list(df.columns)[:20]}")  # Show first 20 columns

        # Standardize column names - common Amazon returns report columns
        column_mapping = {
            # Date columns
            'Return date': 'return_date',
            'Return Date': 'return_date',
            'return-date': 'return_date',
            'Order date': 'order_date',
            'Order Date': 'order_date',
            'order-date': 'order_date',
            
            # Order info
            'Order ID': 'order_id',
            'order-id': 'order_id',
            'OrderId': 'order_id',
            
            # Product info
            'ASIN': 'asin',
            'asin': 'asin',
            'SKU': 'sku',
            'sku': 'sku',
            'Product Name': 'product_name',
            'product-name': 'product_name',
            'Title': 'product_name',
            'title': 'product_name',
            
            # Financial
            'Return Quantity': 'return_quantity',
            'return-quantity': 'return_quantity',
            'Quantity': 'return_quantity',
            'quantity': 'return_quantity',
            'Refund Amount': 'refund_amount',
            'refund-amount': 'refund_amount',
            'Amount': 'refund_amount',
            'Item Price': 'item_price',
            'item-price': 'item_price',
            
            # Reason
            'Return Reason': 'return_reason',
            'return-reason': 'return_reason',
            'Reason': 'return_reason',
            'Status': 'return_status',
            'return-status': 'return_status',
        }

        # Rename columns
        df = df.rename(columns=column_mapping)
        
        print(f"Columns after mapping: {list(df.columns)[:20]}")

        # Handle date conversion for return_date
        if 'return_date' in df.columns:
            print(f"Converting return dates...")
            if df['return_date'].dtype == 'object':
                df['return_date'] = df['return_date'].apply(excel_serial_to_date)
            else:
                df['return_date'] = pd.to_datetime(df['return_date'], errors='coerce')
            
            before_count = len(df)
            df = df.dropna(subset=['return_date'])
            print(f"Removed {before_count - len(df)} rows with invalid return dates")
            
            if not df.empty:
                print(f"Return date range: {df['return_date'].min()} to {df['return_date'].max()}")

        # Handle order_date if present
        if 'order_date' in df.columns:
            print(f"Converting order dates...")
            if df['order_date'].dtype == 'object':
                df['order_date'] = df['order_date'].apply(excel_serial_to_date)
            else:
                df['order_date'] = pd.to_datetime(df['order_date'], errors='coerce')

        # Convert numeric columns
        numeric_cols = ['return_quantity', 'refund_amount', 'item_price']
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

        # Fill NaN values for string columns
        string_cols = ['order_id', 'asin', 'sku', 'product_name', 'return_reason', 'return_status']
        for col in string_cols:
            if col in df.columns:
                df[col] = df[col].fillna('').astype(str)

        # Add calculated fields
        df['year'] = df['return_date'].dt.year
        df['month'] = df['return_date'].dt.month
        df['day'] = df['return_date'].dt.day
        df['weekday'] = df['return_date'].dt.weekday
        
        # Add date for easy filtering
        df['date'] = df['return_date'].dt.date

        # Add processing timestamp
        df['processed_at'] = datetime.now()

        # Calculate return rate metrics if we have both return and order dates
        if 'order_date' in df.columns and not df['order_date'].isna().all():
            df['days_to_return'] = (df['return_date'] - df['order_date']).dt.days

        print(f"Processed shape: {df.shape}")
        print(f"Processed columns: {list(df.columns)}")
        
        # Show sample of data
        if not df.empty:
            print(f"\nSample data:")
            print(df[['return_date', 'product_name', 'refund_amount', 'return_quantity']].head())

        return df

    except Exception as e:
        print(f"❌ Error processing {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return None

def create_bigquery_table(client, dataset_id, table_id, df):
    """Create BigQuery table with appropriate schema"""
    full_table_id = f"{PROJECT_ID}.{dataset_id}.{table_id}"
    
    # Create dataset if it doesn't exist
    try:
        client.get_dataset(dataset_id)
    except:
        dataset = bigquery.Dataset(f"{PROJECT_ID}.{dataset_id}")
        dataset.location = 'US'
        client.create_dataset(dataset)
        print(f"Created dataset {dataset_id}")

    # Build schema based on DataFrame
    schema = []
    for col in df.columns:
        if col in ['return_date', 'order_date', 'processed_at']:
            schema.append(bigquery.SchemaField(col, "TIMESTAMP"))
        elif col in ['date']:
            schema.append(bigquery.SchemaField(col, "DATE"))
        elif col in ['year', 'month', 'day', 'weekday', 'return_quantity', 'days_to_return']:
            schema.append(bigquery.SchemaField(col, "INTEGER"))
        elif df[col].dtype in ['int64', 'Int64']:
            schema.append(bigquery.SchemaField(col, "INTEGER"))
        elif df[col].dtype in ['float64', 'Float64']:
            schema.append(bigquery.SchemaField(col, "FLOAT"))
        else:
            schema.append(bigquery.SchemaField(col, "STRING"))

    # Create or replace table
    table = bigquery.Table(full_table_id, schema=schema)
    table = client.create_table(table, exists_ok=True)

    print(f"✅ Created/verified table {full_table_id}")
    return full_table_id

def upload_to_bigquery(df, table_id, client):
    """Upload DataFrame to BigQuery"""
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE"
    )

    job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
    job.result()

    print(f"✅ Loaded {len(df)} rows into {table_id}")

def verify_data(client):
    """Verify the uploaded data"""
    print(f"\n📊 Data verification:")
    
    summary_query = f"""
    SELECT
        MIN(return_date) as earliest_return,
        MAX(return_date) as latest_return,
        COUNT(*) as total_returns,
        COUNT(DISTINCT asin) as unique_products,
        SUM(return_quantity) as total_units_returned,
        SUM(refund_amount) as total_refund_amount,
        COUNT(DISTINCT order_id) as unique_orders
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    """
    
    results = list(client.query(summary_query).result())
    if results:
        row = results[0]
        print(f"  Date range: {row.earliest_return} to {row.latest_return}")
        print(f"  Total returns: {row.total_returns:,}")
        print(f"  Unique products: {row.unique_products:,}")
        print(f"  Total units returned: {row.total_units_returned:,}")
        print(f"  Total refunds: ${row.total_refund_amount:,.2f}")
        print(f"  Unique orders: {row.unique_orders:,}")
    
    # Recent returns
    recent_query = f"""
    SELECT
        return_date,
        product_name,
        refund_amount,
        return_quantity,
        return_reason
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    ORDER BY return_date DESC
    LIMIT 10
    """
    
    print(f"\n  Recent returns:")
    results = client.query(recent_query).result()
    for row in results:
        print(f"    {row.return_date.date()}: {row.product_name[:50]} - ${row.refund_amount:.2f} x{row.return_quantity}")

def main():
    """Main sync function"""
    print(f"🚀 Starting Amazon Returns SharePoint Sync - {datetime.now()}")

    # Initialize BigQuery client
    client = bigquery.Client(project=PROJECT_ID)

    # Get access token
    access_token = get_access_token()

    # Download file
    local_file = download_sharepoint_excel(access_token)

    if not local_file:
        print("❌ Could not access returns file")
        sys.exit(1)

    # Process the Excel file
    df = process_returns_excel(local_file)

    if df is None or df.empty:
        print("❌ No data to process")
        sys.exit(1)

    # Create and populate table
    table_id = create_bigquery_table(client, DATASET_ID, TABLE_ID, df)
    upload_to_bigquery(df, table_id, client)

    # Verify the data
    verify_data(client)

    print(f"\n✅ Returns sync complete!")
    print(f"📊 Table: {PROJECT_ID}.{DATASET_ID}.{TABLE_ID}")

if __name__ == "__main__":
    main()

