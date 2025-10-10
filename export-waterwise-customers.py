#!/usr/bin/env python3

import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import sys

def export_waterwise_customers():
    """Export comprehensive WaterWise customer data combining pre-Shopify and Shopify data"""

    # Initialize BigQuery client
    client = bigquery.Client(project='intercept-sales-2508061117')

    # Query pre-Shopify customer data
    pre_shopify_query = """
    SELECT
        COALESCE(customer_email, lead_source, 'Unknown') as customer_identifier,
        customer_email,
        lead_source,
        COUNT(*) as total_orders,
        SUM(sales_amount) as total_spent,
        SUM(quantity) as total_quantity,
        ROUND(AVG(sales_amount), 2) as avg_order_value,
        MIN(date) as first_order_date,
        MAX(date) as last_order_date,
        ARRAY_AGG(DISTINCT item_name IGNORE NULLS ORDER BY item_name) as products_purchased,
        ARRAY_AGG(DISTINCT state_region IGNORE NULLS ORDER BY state_region) as states_shipped_to,
        COUNT(DISTINCT EXTRACT(YEAR FROM date)) as years_active,
        'pre_shopify' as data_source
    FROM `intercept-sales-2508061117.waterwise.pre_shopify_orders`
    WHERE customer_email IS NOT NULL
        AND customer_email != ''
        AND customer_email != 'Unknown'
    GROUP BY customer_email, lead_source
    """

    print("Querying pre-Shopify customer data...")
    pre_shopify_df = client.query(pre_shopify_query).to_dataframe()
    print(f"Found {len(pre_shopify_df)} pre-Shopify customers")

    # Query Shopify customer data (when available)
    shopify_query = """
    SELECT
        'shopify_customer' as customer_identifier,
        '' as customer_email,
        '' as lead_source,
        SUM(order_count) as total_orders,
        SUM(total_revenue) as total_spent,
        SUM(total_quantity_sold) as total_quantity,
        ROUND(AVG(avg_unit_price), 2) as avg_order_value,
        MIN(order_date) as first_order_date,
        MAX(order_date) as last_order_date,
        ARRAY_AGG(DISTINCT product_name IGNORE NULLS ORDER BY product_name) as products_purchased,
        ARRAY(['Unknown']) as states_shipped_to,
        COUNT(DISTINCT EXTRACT(YEAR FROM order_date)) as years_active,
        'shopify' as data_source
    FROM `intercept-sales-2508061117.shopify.waterwise_daily_product_sales`
    WHERE order_date IS NOT NULL
    GROUP BY customer_identifier
    """

    print("Querying Shopify customer data...")
    try:
        shopify_df = client.query(shopify_query).to_dataframe()
        print(f"Found {len(shopify_df)} Shopify customers")
    except Exception as e:
        print(f"No Shopify data available: {e}")
        shopify_df = pd.DataFrame()

    # Combine datasets
    if len(shopify_df) > 0:
        all_customers = pd.concat([pre_shopify_df, shopify_df], ignore_index=True)
        print(f"Combined total: {len(all_customers)} customer records")
    else:
        all_customers = pre_shopify_df
        print(f"Using pre-Shopify data only: {len(all_customers)} customers")

    # Add calculated fields
    all_customers['days_since_last_order'] = (
        pd.Timestamp.now() - pd.to_datetime(all_customers['last_order_date'])
    ).dt.days

    # Customer segmentation
    def categorize_customer(row):
        total_spent = row['total_spent']
        days_since_last = row['days_since_last_order']

        # Value segments
        if total_spent >= 50000:
            value_segment = 'VIP'
        elif total_spent >= 10000:
            value_segment = 'High Value'
        elif total_spent >= 1000:
            value_segment = 'Medium Value'
        else:
            value_segment = 'Low Value'

        # Recency segments
        if days_since_last <= 365:
            recency_segment = 'Active'
        elif days_since_last <= 730:
            recency_segment = 'Lapsed'
        else:
            recency_segment = 'Dormant'

        return f"{value_segment} - {recency_segment}"

    all_customers['customer_segment'] = all_customers.apply(categorize_customer, axis=1)

    # Convert arrays to strings for CSV export
    all_customers['products_purchased_list'] = all_customers['products_purchased'].apply(
        lambda x: '; '.join(x) if isinstance(x, list) else str(x)
    )
    all_customers['states_shipped_to_list'] = all_customers['states_shipped_to'].apply(
        lambda x: '; '.join(x) if isinstance(x, list) else str(x)
    )

    # Prepare final export columns
    export_columns = [
        'customer_identifier',
        'customer_email',
        'lead_source',
        'total_orders',
        'total_spent',
        'total_quantity',
        'avg_order_value',
        'first_order_date',
        'last_order_date',
        'days_since_last_order',
        'years_active',
        'customer_segment',
        'products_purchased_list',
        'states_shipped_to_list',
        'data_source'
    ]

    export_df = all_customers[export_columns].copy()

    # Sort by total spent descending
    export_df = export_df.sort_values('total_spent', ascending=False)

    # Export to CSV
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'/Users/samwilhoit/Documents/sales-dashboard/waterwise_customers_export_{timestamp}.csv'

    export_df.to_csv(filename, index=False)
    print(f"Customer data exported to: {filename}")

    # Print summary statistics
    print("\n=== EXPORT SUMMARY ===")
    print(f"Total customers: {len(export_df):,}")
    print(f"Total revenue: ${export_df['total_spent'].sum():,.2f}")
    print(f"Total orders: {export_df['total_orders'].sum():,}")
    print(f"Average customer value: ${export_df['total_spent'].mean():.2f}")

    print("\n=== CUSTOMER SEGMENTS ===")
    segment_summary = export_df.groupby('customer_segment').agg({
        'customer_identifier': 'count',
        'total_spent': 'sum',
        'total_orders': 'sum'
    }).round(2)
    segment_summary.columns = ['customer_count', 'total_revenue', 'total_orders']
    print(segment_summary)

    print(f"\n=== TOP 20 CUSTOMERS ===")
    top_customers = export_df.head(20)[['customer_identifier', 'total_spent', 'total_orders', 'last_order_date', 'customer_segment']]
    print(top_customers.to_string(index=False))

    return filename

if __name__ == "__main__":
    export_waterwise_customers()