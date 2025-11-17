#!/usr/bin/env python3
"""
Cloud Function: Amazon Returns SharePoint Sync
Automatically fetches Amazon returns data from SharePoint and uploads to BigQuery
"""

import os
import requests
import pandas as pd
from google.cloud import bigquery
from datetime import datetime, timedelta
import functions_framework
import io

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
TENANT_ID = os.environ.get('MICROSOFT_TENANT_ID')
CLIENT_ID = os.environ.get('MICROSOFT_CLIENT_ID')
CLIENT_SECRET = os.environ.get('MICROSOFT_CLIENT_SECRET')

# Amazon Returns SharePoint file
RETURNS_FILE_CONFIG = {
    'name': 'Amazon Returns',
    'file_id': 'C0BF238B-1CDA-47FD-A968-087EE7A27270',
    'table_id': f'{PROJECT_ID}.amazon_seller.returns',
    'sheet_name': 0  # First sheet, or specify name if known
}

def get_access_token():
    """Get Microsoft Graph access token"""
    if not all([TENANT_ID, CLIENT_ID, CLIENT_SECRET]):
        raise ValueError("Microsoft credentials not configured")

    auth_url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"

    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope': 'https://graph.microsoft.com/.default'
    }

    response = requests.post(auth_url, headers=headers, data=data)
    response.raise_for_status()

    return response.json()['access_token']

def download_excel_by_file_id(file_id, access_token):
    """Download Excel file from SharePoint using direct file ID"""
    try:
        headers = {'Authorization': f'Bearer {access_token}'}

        # Get the file metadata and download URL
        file_url = f"https://graph.microsoft.com/v1.0/users/swilhoit@tetrahedronglobal.onmicrosoft.com/drive/items/{file_id}"
        response = requests.get(file_url, headers=headers)
        response.raise_for_status()

        file_info = response.json()
        download_url = file_info.get('@microsoft.graph.downloadUrl')

        if not download_url:
            raise ValueError("No download URL found")

        # Download the file content
        file_response = requests.get(download_url)
        file_response.raise_for_status()

        return file_response.content

    except Exception as e:
        print(f"Error downloading file: {e}")
        raise

def excel_serial_to_date(serial_date):
    """Convert Excel serial date to proper datetime"""
    if pd.isna(serial_date) or serial_date == '':
        return None
    try:
        excel_epoch = datetime(1899, 12, 30)
        return excel_epoch + timedelta(days=int(float(serial_date)))
    except (ValueError, TypeError):
        try:
            return pd.to_datetime(serial_date)
        except:
            return None

def parse_returns_excel(content, sheet_name):
    """Parse Amazon returns Excel file into DataFrame"""
    try:
        excel_file = io.BytesIO(content)
        df = pd.read_excel(excel_file, sheet_name=sheet_name)

        print(f"Parsed {len(df)} rows from returns file")

        if df.empty:
            raise ValueError("No data in Excel file")

        # Standardize column names - flexible to handle various formats
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
            'Order Id': 'order_id',
            
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
            'Refunded': 'refund_amount',
            'Item Price': 'item_price',
            'item-price': 'item_price',
            'Price': 'item_price',
            
            # Reason
            'Return Reason': 'return_reason',
            'return-reason': 'return_reason',
            'Reason': 'return_reason',
            'Status': 'return_status',
            'return-status': 'return_status',
        }

        # Rename columns
        df = df.rename(columns=column_mapping)

        print(f"Columns after mapping: {list(df.columns)}")

        # Handle date conversion for return_date
        if 'return_date' in df.columns:
            print("Converting return dates...")
            if df['return_date'].dtype == 'object':
                df['return_date'] = df['return_date'].apply(excel_serial_to_date)
            else:
                df['return_date'] = pd.to_datetime(df['return_date'], errors='coerce')
            
            df = df.dropna(subset=['return_date'])
            print(f"Valid returns with dates: {len(df)}")
            
            if not df.empty:
                print(f"Return date range: {df['return_date'].min()} to {df['return_date'].max()}")

        # Handle order_date if present
        if 'order_date' in df.columns:
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
        df['date'] = df['return_date'].dt.date
        df['processed_at'] = datetime.now()

        # Calculate days_to_return if both dates available
        if 'order_date' in df.columns and not df['order_date'].isna().all():
            df['days_to_return'] = (df['return_date'] - df['order_date']).dt.days
        else:
            df['days_to_return'] = None

        # Keep only the columns we need for BigQuery
        final_columns = [
            'return_date', 'order_date', 'date', 'order_id', 'asin', 'sku',
            'product_name', 'return_quantity', 'refund_amount', 'item_price',
            'return_reason', 'return_status', 'days_to_return',
            'year', 'month', 'day', 'weekday', 'processed_at'
        ]

        df = df[[col for col in final_columns if col in df.columns]]

        print(f"Processed {len(df)} returns successfully")
        print(f"Total refund amount: ${df['refund_amount'].sum():,.2f}")
        
        return df

    except Exception as e:
        print(f"Error parsing returns Excel: {e}")
        import traceback
        traceback.print_exc()
        raise

def create_bigquery_table_if_not_exists(client, dataset_id, table_name):
    """Create returns table in BigQuery if it doesn't exist"""
    table_id = f"{PROJECT_ID}.{dataset_id}.{table_name}"
    
    schema = [
        bigquery.SchemaField("return_date", "TIMESTAMP"),
        bigquery.SchemaField("order_date", "TIMESTAMP"),
        bigquery.SchemaField("date", "DATE"),
        bigquery.SchemaField("order_id", "STRING"),
        bigquery.SchemaField("asin", "STRING"),
        bigquery.SchemaField("sku", "STRING"),
        bigquery.SchemaField("product_name", "STRING"),
        bigquery.SchemaField("return_quantity", "INTEGER"),
        bigquery.SchemaField("refund_amount", "FLOAT"),
        bigquery.SchemaField("item_price", "FLOAT"),
        bigquery.SchemaField("return_reason", "STRING"),
        bigquery.SchemaField("return_status", "STRING"),
        bigquery.SchemaField("days_to_return", "INTEGER"),
        bigquery.SchemaField("year", "INTEGER"),
        bigquery.SchemaField("month", "INTEGER"),
        bigquery.SchemaField("day", "INTEGER"),
        bigquery.SchemaField("weekday", "INTEGER"),
        bigquery.SchemaField("processed_at", "TIMESTAMP"),
    ]
    
    table = bigquery.Table(table_id, schema=schema)
    
    try:
        client.create_table(table, exists_ok=True)
        print(f"Ensured table exists: {table_id}")
    except Exception as e:
        print(f"Note: Table may already exist: {e}")

def upload_to_bigquery(df, table_id):
    """Upload DataFrame to BigQuery with replace strategy"""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Ensure table exists
        dataset_id, table_name = table_id.split('.')[-2:]
        create_bigquery_table_if_not_exists(client, dataset_id, table_name)

        # Convert dates to strings for JSON serialization
        records = df.to_dict('records')
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif hasattr(value, 'isoformat'):
                    record[key] = value.isoformat()
                elif isinstance(value, (int, float)) and pd.isna(value):
                    record[key] = None

        table_ref = client.dataset(dataset_id).table(table_name)

        # Delete old data first (full replace)
        try:
            delete_query = f"DELETE FROM `{table_id}` WHERE TRUE"
            client.query(delete_query).result()
            print("Deleted old returns data")
        except Exception as e:
            print(f"Note: Could not delete old data: {e}")

        # Insert new data
        errors = client.insert_rows_json(table_ref, records, row_ids=[None] * len(records))

        if errors:
            print(f"Insert errors: {errors[:5]}")  # Show first 5 errors
            raise ValueError(f"Insert errors: {errors[:5]}")

        print(f"Uploaded {len(records)} returns to {table_id}")
        return True

    except Exception as e:
        print(f"Error uploading to BigQuery: {e}")
        import traceback
        traceback.print_exc()
        raise

@functions_framework.http
def amazon_returns_sync(request):
    """HTTP Cloud Function to sync Amazon returns from SharePoint to BigQuery"""

    print(f"Starting Amazon Returns SharePoint sync at {datetime.now()}")

    try:
        # Get access token
        access_token = get_access_token()
        print("Authenticated with Microsoft Graph")

        # Download Excel file
        print(f"Downloading: {RETURNS_FILE_CONFIG['name']}")
        content = download_excel_by_file_id(
            RETURNS_FILE_CONFIG['file_id'],
            access_token
        )
        print(f"Downloaded file ({len(content)} bytes)")

        # Parse Excel data
        df = parse_returns_excel(content, RETURNS_FILE_CONFIG['sheet_name'])

        # Upload to BigQuery
        upload_to_bigquery(df, RETURNS_FILE_CONFIG['table_id'])

        # Calculate summary
        total_refunds = df['refund_amount'].sum()
        total_returns = len(df)
        date_range = f"{df['return_date'].min().date()} to {df['return_date'].max().date()}"

        result = {
            'status': 'success',
            'timestamp': datetime.now().isoformat(),
            'returns_processed': total_returns,
            'total_refunds': float(total_refunds),
            'date_range': date_range,
            'table': RETURNS_FILE_CONFIG['table_id'],
            'message': f"Successfully processed {total_returns} returns (${total_refunds:,.2f} in refunds)"
        }

        print(f"✅ Sync completed successfully: {result['message']}")
        return result

    except Exception as e:
        error_msg = f"Error syncing returns: {str(e)}"
        print(f"❌ {error_msg}")
        import traceback
        traceback.print_exc()
        
        return {
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': error_msg
        }, 500

