#!/usr/bin/env python3
"""
Cloud Function: Direct SharePoint to BigQuery Sync
Fetches Amazon orders Excel from SharePoint and uploads directly to BigQuery
No Vercel/Next.js dependency - pure Python
"""

import os
import requests
import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import functions_framework
import io
import base64

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
TENANT_ID = os.environ.get('MICROSOFT_TENANT_ID')
CLIENT_ID = os.environ.get('MICROSOFT_CLIENT_ID')
CLIENT_SECRET = os.environ.get('MICROSOFT_CLIENT_SECRET')

# File configurations
FILES_TO_SYNC = [
    {
        'name': 'Amazon Orders 2025',
        'share_url': 'https://tetrahedronglobal-my.sharepoint.com/:x:/g/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/ET27IzaEhPBOim8JgIJNepUBr38bFsOScEH4UCqiyidk_A',
        'table_id': f'{PROJECT_ID}.amazon_seller.amazon_orders_2025',
        'sheet_name': 'Funnel data'
    }
]

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

def download_excel_from_sharepoint(share_url, access_token):
    """Download Excel file from SharePoint using share URL"""
    try:
        # Encode the share URL
        base64_value = base64.b64encode(share_url.encode()).decode()
        encoded_url = 'u!' + base64_value.replace('=', '').replace('+', '-').replace('/', '_')

        headers = {'Authorization': f'Bearer {access_token}'}

        # Get the shared item
        shared_item_url = f"https://graph.microsoft.com/v1.0/shares/{encoded_url}/driveItem"
        response = requests.get(shared_item_url, headers=headers)
        response.raise_for_status()

        shared_item = response.json()
        download_url = shared_item.get('@microsoft.graph.downloadUrl')

        if not download_url:
            raise ValueError("No download URL found")

        # Download the file content
        file_response = requests.get(download_url)
        file_response.raise_for_status()

        return file_response.content

    except Exception as e:
        print(f"Error downloading file: {e}")
        raise

def parse_excel_data(content, sheet_name):
    """Parse Excel file content into DataFrame"""
    try:
        # Read Excel from bytes
        excel_file = io.BytesIO(content)
        df = pd.read_excel(excel_file, sheet_name=sheet_name)

        # Clean column names to match BigQuery schema
        df.columns = df.columns.str.strip().str.replace(' ', '_').str.replace('(', '').str.replace(')', '').str.replace('*', '').str.rstrip('_')

        print(f"Parsed {len(df)} rows with columns: {list(df.columns)}")

        return df

    except Exception as e:
        print(f"Error parsing Excel: {e}")
        raise

def upload_to_bigquery(df, table_id):
    """Upload DataFrame to BigQuery using JSON"""
    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Convert DataFrame to list of dicts for direct insert
        records = df.to_dict('records')

        # Clean up the records (convert NaN to None, dates to strings)
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None
                elif isinstance(value, pd.Timestamp):
                    record[key] = value.strftime('%Y-%m-%d')
                elif hasattr(value, 'isoformat'):  # datetime objects
                    record[key] = value.isoformat()

        # Get or create table reference
        dataset_id, table_name = table_id.split('.')[-2:]
        table_ref = client.dataset(dataset_id).table(table_name)

        # Try to delete old data first (for full refresh)
        try:
            delete_query = f"DELETE FROM `{table_id}` WHERE TRUE"
            client.query(delete_query).result()
            print("Deleted old data")
        except Exception as e:
            print(f"Note: Could not delete old data (table may not exist yet): {e}")

        # Insert new records
        errors = client.insert_rows_json(table_ref, records, row_ids=[None] * len(records))

        if errors:
            print(f"Errors inserting rows: {errors}")
            raise ValueError(f"Insert errors: {errors}")

        print(f"Uploaded {len(records)} rows to {table_id}")
        return True

    except Exception as e:
        print(f"Error uploading to BigQuery: {e}")
        raise

@functions_framework.http
def sharepoint_sync(request):
    """HTTP Cloud Function to sync SharePoint Excel to BigQuery"""

    print(f"Starting SharePoint sync at {datetime.now()}")

    results = []

    try:
        # Get access token
        access_token = get_access_token()
        print("Authenticated with Microsoft Graph")

        # Process each file
        for file_config in FILES_TO_SYNC:
            print(f"\nProcessing: {file_config['name']}")

            try:
                # Download Excel file
                content = download_excel_from_sharepoint(
                    file_config['share_url'],
                    access_token
                )
                print(f"Downloaded file ({len(content)} bytes)")

                # Parse Excel data
                df = parse_excel_data(content, file_config['sheet_name'])

                # Upload to BigQuery
                upload_to_bigquery(df, file_config['table_id'])

                results.append({
                    'name': file_config['name'],
                    'success': True,
                    'rows_processed': len(df),
                    'table': file_config['table_id']
                })

            except Exception as e:
                print(f"Error processing {file_config['name']}: {e}")
                results.append({
                    'name': file_config['name'],
                    'success': False,
                    'error': str(e)
                })

        # Summary
        success_count = sum(1 for r in results if r['success'])
        total_rows = sum(r.get('rows_processed', 0) for r in results if r['success'])

        return {
            'status': 'completed',
            'timestamp': datetime.now().isoformat(),
            'files_processed': len(results),
            'successful': success_count,
            'total_rows': total_rows,
            'results': results
        }

    except Exception as e:
        print(f"Fatal error: {e}")
        return {
            'status': 'error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }, 500
