"""
Updated Amazon data sync cloud function
Processes amazon_orders_2025 into daily_total_sales
"""

import os
from datetime import datetime, timedelta
from google.cloud import bigquery
import functions_framework

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

@functions_framework.http
def amazon_data_sync(request):
    """HTTP Cloud Function to sync Amazon data daily"""
    
    print('Starting Amazon daily data sync...')
    client = bigquery.Client(project=PROJECT_ID)
    
    try:
        # Clear recent data (last 7 days)
        delete_query = f"""
        DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        delete_job = client.query(delete_query)
        delete_job.result()
        print('Cleared old daily sales data')
        
        # Aggregate from orders table
        insert_query = f"""
        INSERT INTO `{PROJECT_ID}.amazon.daily_total_sales` 
        (date, ordered_product_sales, imported_at, day_of_week, month, quarter)
        SELECT 
            purchase_date as date,
            ordered_product_sales,
            imported_at,
            day_of_week,
            month,
            quarter
        FROM (
            SELECT 
                DATE(Purchase_Date) as purchase_date,
                SUM(Item_Price) as ordered_product_sales,
                CURRENT_TIMESTAMP() as imported_at,
                FORMAT_DATE('%A', DATE(Purchase_Date)) as day_of_week,
                FORMAT_DATE('%B', DATE(Purchase_Date)) as month,
                CONCAT('Q', CAST(EXTRACT(QUARTER FROM DATE(Purchase_Date)) AS STRING)) as quarter
            FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
            WHERE Purchase_Date IS NOT NULL
                AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                AND DATE(Purchase_Date) <= CURRENT_DATE()
            GROUP BY DATE(Purchase_Date)
        )
        ORDER BY date DESC
        """
        
        insert_job = client.query(insert_query)
        insert_job.result()
        
        # Verify results
        count_query = f"""
        SELECT 
            COUNT(*) as days_processed,
            SUM(ordered_product_sales) as total_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        count_job = client.query(count_query)
        result = list(count_job.result())[0]
        
        print(f'Successfully processed {result.days_processed} days')
        print(f'Total sales: ${result.total_sales:,.2f}')
        
        return {
            'status': 'success',
            'days_processed': int(result.days_processed),
            'total_sales': float(result.total_sales),
            'timestamp': datetime.now().isoformat(),
            'message': f'Amazon data sync completed - {result.days_processed} days processed'
        }
        
    except Exception as e:
        print(f'Error in Amazon data sync: {e}')
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }, 500