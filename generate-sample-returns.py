#!/usr/bin/env python3
"""
Generate Sample Amazon Returns Data
Creates realistic sample data to test the returns dashboard
"""

import pandas as pd
from datetime import datetime, timedelta
import random
import sys

# Sample product data (similar to real Amazon products)
SAMPLE_PRODUCTS = [
    {"asin": "B08L5VFJ5M", "name": "Fireplace Glass Door 36 inch", "base_price": 299.99},
    {"asin": "B07XQKNW3P", "name": "Chimney Cap Stainless Steel", "base_price": 89.99},
    {"asin": "B09KN2VQ7L", "name": "Fireplace Insert Electric", "base_price": 449.99},
    {"asin": "B08YD5HR3M", "name": "Wood Stove Pipe 6 inch", "base_price": 45.99},
    {"asin": "B07BQHCXPQ", "name": "Fireplace Tools Set 5 Piece", "base_price": 79.99},
    {"asin": "B09M3TY8RL", "name": "Gas Log Set Ventless 24 inch", "base_price": 329.99},
    {"asin": "B08VRFZT2X", "name": "Pellet Stove Hopper", "base_price": 159.99},
    {"asin": "B07YT6K2PQ", "name": "Fireplace Screen Mesh Curtain", "base_price": 119.99},
    {"asin": "B09XBCD1MN", "name": "Chimney Brush Kit", "base_price": 34.99},
    {"asin": "B08HK7VBNM", "name": "Fireplace Grate Cast Iron", "base_price": 89.99},
]

RETURN_REASONS = [
    "Defective",
    "Not as described",
    "Wrong item shipped",
    "Customer changed mind",
    "Size too small",
    "Size too large",
    "Quality not as expected",
    "Arrived damaged",
    "No longer needed",
    "Found better price"
]

def generate_sample_returns(num_returns=150, days_back=90):
    """Generate realistic sample returns data"""
    
    print(f"Generating {num_returns} sample returns over {days_back} days...")
    
    returns = []
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    
    for i in range(num_returns):
        # Random return date
        return_date = start_date + timedelta(
            days=random.randint(0, days_back),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        )
        
        # Order date was 5-30 days before return
        days_before = random.randint(5, 30)
        order_date = return_date - timedelta(days=days_before)
        
        # Random product
        product = random.choice(SAMPLE_PRODUCTS)
        
        # Quantity (most are single items, some multiple)
        quantity = random.choices([1, 2, 3], weights=[85, 10, 5])[0]
        
        # Price with some variation
        item_price = product["base_price"] * random.uniform(0.9, 1.1)
        refund_amount = item_price * quantity * random.uniform(0.95, 1.0)  # Sometimes partial refund
        
        # Random reason
        reason = random.choice(RETURN_REASONS)
        
        # Status (most are completed)
        status = random.choices(
            ["Completed", "Processing", "Approved"], 
            weights=[90, 8, 2]
        )[0]
        
        # Generate order ID
        order_id = f"113-{random.randint(1000000, 9999999)}-{random.randint(1000000, 9999999)}"
        
        # SKU
        sku = f"FP-{product['asin'][-6:]}"
        
        returns.append({
            'Return date': return_date,
            'Order date': order_date,
            'Order ID': order_id,
            'ASIN': product['asin'],
            'SKU': sku,
            'Product Name': product['name'],
            'Return Quantity': quantity,
            'Refund Amount': round(refund_amount, 2),
            'Item Price': round(item_price, 2),
            'Return Reason': reason,
            'Status': status
        })
    
    df = pd.DataFrame(returns)
    
    # Sort by return date
    df = df.sort_values('Return date', ascending=False)
    
    return df

def main():
    """Generate sample data and save to Excel"""
    
    # Generate data
    df = generate_sample_returns(num_returns=150, days_back=90)
    
    # Save to Excel
    output_file = 'amazon returns.xlsx'
    df.to_excel(output_file, index=False, sheet_name='Returns')
    
    # Print summary
    total_refunds = df['Refund Amount'].sum()
    total_returns = len(df)
    date_range = f"{df['Return date'].min().date()} to {df['Return date'].max().date()}"
    
    print(f"\n{'='*60}")
    print(f"✅ Sample Returns Data Generated!")
    print(f"{'='*60}")
    print(f"File: {output_file}")
    print(f"Total Returns: {total_returns}")
    print(f"Total Refunds: ${total_refunds:,.2f}")
    print(f"Date Range: {date_range}")
    print(f"")
    print(f"Sample products:")
    for product in SAMPLE_PRODUCTS[:5]:
        product_returns = df[df['ASIN'] == product['asin']]
        if len(product_returns) > 0:
            print(f"  - {product['name']}: {len(product_returns)} returns")
    
    print(f"\n{'='*60}")
    print(f"Next steps:")
    print(f"{'='*60}")
    print(f"1. Run: python3 sync-amazon-returns.py")
    print(f"2. View dashboard: http://localhost:3000/dashboard/overview")
    print(f"3. See Returns Impact Card with this sample data!")
    print(f"")
    print(f"⚠️  This is sample data for testing.")
    print(f"Replace with real data from SharePoint when ready.")
    
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

