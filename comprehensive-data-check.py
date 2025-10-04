#!/usr/bin/env python3
"""
Comprehensive data pipeline health check and summary
"""

import os
from google.cloud import bigquery
from datetime import datetime, timedelta
from tabulate import tabulate

# Configure BigQuery
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def check_data_source(source_name, query):
    """Execute query and return results"""
    try:
        job = client.query(query)
        result = list(job.result())[0]
        return dict(result)
    except Exception as e:
        return {'error': str(e)}

def main():
    print("=" * 80)
    print("SALES DASHBOARD DATA PIPELINE STATUS CHECK")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Project: {PROJECT_ID}\n")
    
    # Define data sources to check
    sources = [
        {
            'name': 'Amazon Orders (Source)',
            'query': f"""
                SELECT 
                    COUNT(*) as total_rows,
                    MIN(DATE(Purchase_Date)) as earliest_date,
                    MAX(DATE(Purchase_Date)) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(DATE(Purchase_Date)), DAY) as days_behind,
                    SUM(Item_Price) as total_revenue
                FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
                WHERE Purchase_Date IS NOT NULL
            """
        },
        {
            'name': 'Amazon Daily Sales',
            'query': f"""
                SELECT 
                    COUNT(*) as total_rows,
                    MIN(date) as earliest_date,
                    MAX(date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(date), DAY) as days_behind,
                    SUM(ordered_product_sales) as total_revenue
                FROM `{PROJECT_ID}.amazon.daily_total_sales`
            """
        },
        {
            'name': 'BrickAnew (WooCommerce)',
            'query': f"""
                SELECT 
                    COUNT(DISTINCT order_date) as total_rows,
                    MIN(order_date) as earliest_date,
                    MAX(order_date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(order_date), DAY) as days_behind,
                    SUM(total_revenue) as total_revenue
                FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
            """
        },
        {
            'name': 'Heatilator (WooCommerce)',
            'query': f"""
                SELECT 
                    COUNT(DISTINCT order_date) as total_rows,
                    MIN(order_date) as earliest_date,
                    MAX(order_date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(order_date), DAY) as days_behind,
                    SUM(total_revenue) as total_revenue
                FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
            """
        },
        {
            'name': 'Superior (WooCommerce)',
            'query': f"""
                SELECT 
                    COUNT(DISTINCT order_date) as total_rows,
                    MIN(order_date) as earliest_date,
                    MAX(order_date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(order_date), DAY) as days_behind,
                    SUM(total_revenue) as total_revenue
                FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
            """
        },
        {
            'name': 'WaterWise (Shopify)',
            'query': f"""
                SELECT 
                    COUNT(DISTINCT order_date) as total_rows,
                    MIN(order_date) as earliest_date,
                    MAX(order_date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(order_date), DAY) as days_behind,
                    SUM(total_revenue) as total_revenue
                FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
            """
        },
        {
            'name': 'MASTER Aggregation',
            'query': f"""
                SELECT 
                    COUNT(*) as total_rows,
                    MIN(date) as earliest_date,
                    MAX(date) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX(date), DAY) as days_behind,
                    SUM(total_sales) as total_revenue
                FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            """
        }
    ]
    
    # Collect results
    results = []
    for source in sources:
        data = check_data_source(source['name'], source['query'])
        if 'error' in data:
            results.append([
                source['name'],
                'ERROR',
                '-',
                '-',
                '-',
                '-',
                '❌'
            ])
        else:
            days_behind = data.get('days_behind')
            if days_behind is None:
                days_behind = 999
            if days_behind == 0:
                status = '✅'
            elif days_behind <= 1:
                status = '⚠️'
            else:
                status = '❌'
            
            revenue = data.get('total_revenue', 0)
            if revenue:
                revenue_str = f"${revenue:,.0f}"
            else:
                revenue_str = "$0"
            
            results.append([
                source['name'],
                data.get('total_rows', 0),
                data.get('earliest_date', '-'),
                data.get('latest_date', '-'),
                days_behind,
                revenue_str,
                status
            ])
    
    # Display results
    headers = ['Data Source', 'Records', 'Earliest', 'Latest', 'Days Behind', 'Total Revenue', 'Status']
    print(tabulate(results, headers=headers, tablefmt='grid'))
    
    # Check last 7 days sales by channel
    print("\n" + "=" * 80)
    print("LAST 7 DAYS SALES BY CHANNEL")
    print("=" * 80)
    
    weekly_query = f"""
        SELECT 
            date,
            ROUND(amazon_sales, 2) as amazon,
            ROUND(woocommerce_sales, 2) as woocommerce,
            ROUND(shopify_sales, 2) as shopify,
            ROUND(total_sales, 2) as total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        ORDER BY date DESC
    """
    
    try:
        job = client.query(weekly_query)
        weekly_data = []
        for row in job.result():
            weekly_data.append([
                row.date,
                f"${row.amazon:,.0f}" if row.amazon else "$0",
                f"${row.woocommerce:,.0f}" if row.woocommerce else "$0",
                f"${row.shopify:,.0f}" if row.shopify else "$0",
                f"${row.total:,.0f}" if row.total else "$0"
            ])
        
        if weekly_data:
            headers = ['Date', 'Amazon', 'WooCommerce', 'Shopify', 'Total']
            print(tabulate(weekly_data, headers=headers, tablefmt='grid'))
    except Exception as e:
        print(f"Error fetching weekly data: {e}")
    
    # Recommendations
    print("\n" + "=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)
    
    issues = []
    for row in results:
        if row[6] == '❌' and row[0] != 'WaterWise (Shopify)':  # Ignore Shopify for now
            if row[4] == '-':
                issues.append(f"• {row[0]}: Error accessing table")
            elif row[4] > 1:
                issues.append(f"• {row[0]}: Data is {row[4]} days behind - needs immediate sync")
    
    if issues:
        print("Issues found:")
        for issue in issues:
            print(issue)
    else:
        print("✅ All data sources are up to date!")
    
    print("\nNext steps:")
    print("1. Run 'npx tsx sync-now.ts' to sync Amazon Excel data")
    print("2. Check WooCommerce API credentials for Heatilator and Superior")
    print("3. Configure Shopify integration for WaterWise")
    print("4. Set up proper cloud function schedules for all sources")

if __name__ == "__main__":
    main()