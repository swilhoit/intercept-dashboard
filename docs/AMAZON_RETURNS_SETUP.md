# Amazon Returns Integration - Setup Guide

## Overview

This integration adds Amazon returns tracking to your sales dashboard, allowing you to:
- Monitor return rates by product
- Track refund amounts over time
- Analyze return reasons
- Identify problematic products
- Calculate true profitability (sales minus returns)

## Files Created

### Backend
1. **`sync-amazon-returns.py`** - Main sync script that downloads and processes returns data from SharePoint
2. **`src/app/api/amazon/returns/route.ts`** - API endpoint for retrieving returns data

### Frontend
1. **`src/components/dashboard/amazon-returns-dashboard.tsx`** - Main dashboard component
2. **`src/app/dashboard/amazon-returns/page.tsx`** - Dashboard page
3. Updated navigation in `src/app/dashboard/layout.tsx` and `src/components/dashboard/sidebar-nav.tsx`

## Data Source

**SharePoint File**: `amazon returns.xlsx`
- URL: https://tetrahedronglobal-my.sharepoint.com/personal/swilhoit_tetrahedronglobal_onmicrosoft_com/_layouts/15/Doc.aspx?sourcedoc=%7BC0BF238B-1CDA-47FD-A968-087EE7A27270%7D&file=amazon%20returns.xlsx

**BigQuery Table**: `intercept-sales-2508061117.amazon_seller.returns`

## Setup Instructions

### 1. Download the Returns File Locally (Quick Start)

For initial testing, download the Excel file manually:

```bash
# Download from SharePoint and save as "amazon returns.xlsx" in the project root
cd /Users/samwilhoit/Documents/sales-dashboard
# Place the file here: amazon returns.xlsx
```

### 2. Run the Sync Script

```bash
cd /Users/samwilhoit/Documents/sales-dashboard
python3 sync-amazon-returns.py
```

The script will:
- ✅ Look for local `amazon returns.xlsx` file first
- ✅ Process the Excel data and standardize columns
- ✅ Create the BigQuery table if it doesn't exist
- ✅ Upload the data to BigQuery
- ✅ Show verification statistics

Expected output:
```
🚀 Starting Amazon Returns SharePoint Sync - 2025-11-17 12:00:00
✅ Using local file: amazon returns.xlsx
============================================================
Processing: amazon returns.xlsx
============================================================
Original shape: (500, 15)
Converting return dates...
Return date range: 2024-01-01 to 2025-11-15
Processed shape: (498, 18)

✅ Created/verified table intercept-sales-2508061117.amazon_seller.returns
✅ Loaded 498 rows into intercept-sales-2508061117.amazon_seller.returns

📊 Data verification:
  Date range: 2024-01-01 to 2025-11-15
  Total returns: 498
  Unique products: 85
  Total units returned: 512
  Total refunds: $45,231.50
  Unique orders: 475

✅ Returns sync complete!
```

### 3. Access the Dashboard

Once data is synced, access the dashboard at:
- **URL**: http://localhost:3000/dashboard/amazon-returns
- **Navigation**: Dashboard → Sites & Channels → Amazon Returns

## Data Schema

The sync script expects these columns in the Excel file (flexible column names):

| Column | Variations | Type | Description |
|--------|-----------|------|-------------|
| Return Date | return_date, return-date | Date | When the return was processed |
| Order Date | order_date, order-date | Date | Original order date |
| Order ID | order-id, OrderId | String | Amazon order identifier |
| ASIN | asin | String | Product identifier |
| SKU | sku | String | Seller SKU |
| Product Name | product-name, Title | String | Product name |
| Return Quantity | return-quantity, Quantity | Number | Units returned |
| Refund Amount | refund-amount, Amount | Number | $ refunded to customer |
| Item Price | item-price | Number | Original item price |
| Return Reason | return-reason, Reason | String | Customer's return reason |
| Status | return-status | String | Return status |

### Calculated Fields

The script adds these fields:
- `year`, `month`, `day`, `weekday` - Date components for filtering
- `date` - Date-only field for grouping
- `days_to_return` - Days between order and return (if both dates available)
- `processed_at` - Timestamp when data was synced

## Dashboard Features

### Summary Cards
- **Total Returns** - Count of all returns
- **Total Refunds** - Sum of all refund amounts
- **Units Returned** - Total units returned
- **Avg Days to Return** - Average time from order to return

### Visualizations
1. **Returns Over Time** - Line chart showing daily return counts and refund amounts
2. **Most Returned Products** - Top 20 products by return count
3. **Return Reasons** - Pie chart and list of why customers return items
4. **Detailed Products Table** - Complete list with metrics per product

## Automation (Future)

### Option 1: Cloud Function with SharePoint API

Add Microsoft credentials to `.env`:
```bash
MICROSOFT_TENANT_ID=your_tenant_id
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret
```

Then the script will automatically download from SharePoint.

### Option 2: Cloud Scheduler

Deploy to Google Cloud Functions and schedule daily:
```bash
# Deploy function
gcloud functions deploy amazon-returns-sync \
  --runtime python39 \
  --trigger-http \
  --entry-point sync_returns \
  --source .

# Schedule daily at 8 AM
gcloud scheduler jobs create http amazon-returns-daily \
  --schedule="0 8 * * *" \
  --uri="https://us-central1-PROJECT.cloudfunctions.net/amazon-returns-sync" \
  --http-method=POST
```

### Option 3: Manual Updates

For now, run manually when the Excel file is updated:
```bash
cd /Users/samwilhoit/Documents/sales-dashboard
# Download latest file from SharePoint
python3 sync-amazon-returns.py
```

## Troubleshooting

### Error: "File not found"
```bash
# Download the file from SharePoint and save as:
# amazon returns.xlsx
# in the project root directory
```

### Error: "No data to process"
- Check that the Excel file has data in the first sheet
- Verify the date columns are properly formatted
- Check console output for which columns were found

### Error: "BigQuery authentication failed"
```bash
# Make sure you're authenticated
gcloud auth application-default login

# Verify project
gcloud config set project intercept-sales-2508061117
```

### Dashboard shows no data
1. Check that sync completed successfully
2. Verify data in BigQuery:
```sql
SELECT COUNT(*) 
FROM `intercept-sales-2508061117.amazon_seller.returns`
```
3. Check browser console for API errors
4. Verify date range filter includes return dates

## Business Insights

### Key Metrics to Watch

1. **Return Rate Trends**
   - Track if returns are increasing over time
   - Identify seasonal patterns
   - Compare to industry benchmarks (typically 5-15% for Amazon)

2. **High-Return Products**
   - Products with >10% return rate need investigation
   - Common issues: sizing, quality, description mismatch
   - May need better product photos/descriptions

3. **Return Reasons**
   - "Defective" → Quality control issue
   - "Wrong item" → Fulfillment/listing issue
   - "Not as described" → Update listing content
   - "Changed mind" → Normal, but high rate = price too high

4. **Financial Impact**
   - Refunds reduce net revenue
   - Returns cost shipping both ways
   - Amazon may charge restocking fees
   - Factor into ROAS calculations

### Action Items

**For products with high return rates:**
1. ✅ Review product descriptions and photos
2. ✅ Check for quality issues with supplier
3. ✅ Add size charts or dimension guides
4. ✅ Consider pausing ads on problematic products
5. ✅ Calculate true profitability: (Sales - Refunds - Ad Spend - COGS)

**For return reason analysis:**
1. ✅ Address common issues in product listing
2. ✅ Add FAQ section to listings
3. ✅ Improve packaging if damage is common
4. ✅ Consider product improvements

## Integration with Other Data

### Returns + Sales Analysis

Calculate true return rate:
```sql
WITH sales AS (
  SELECT 
    asin,
    product_name,
    COUNT(*) as order_count,
    SUM(revenue) as total_sales
  FROM `intercept-sales-2508061117.amazon_seller.amazon_orders_2025`
  GROUP BY asin, product_name
),
returns AS (
  SELECT
    asin,
    COUNT(*) as return_count,
    SUM(refund_amount) as total_refunds
  FROM `intercept-sales-2508061117.amazon_seller.returns`
  GROUP BY asin
)
SELECT
  s.asin,
  s.product_name,
  s.order_count,
  s.total_sales,
  COALESCE(r.return_count, 0) as return_count,
  COALESCE(r.total_refunds, 0) as total_refunds,
  ROUND(COALESCE(r.return_count, 0) / s.order_count * 100, 2) as return_rate_pct,
  ROUND(s.total_sales - COALESCE(r.total_refunds, 0), 2) as net_revenue
FROM sales s
LEFT JOIN returns r USING (asin)
ORDER BY return_rate_pct DESC
```

### Returns + Advertising ROAS

Adjust ROAS for returns:
```sql
-- True ROAS = (Sales - Refunds) / Ad Spend
SELECT
  DATE(a.date) as date,
  SUM(s.revenue) as gross_sales,
  SUM(COALESCE(r.refund_amount, 0)) as refunds,
  SUM(s.revenue) - SUM(COALESCE(r.refund_amount, 0)) as net_sales,
  SUM(a.cost) as ad_spend,
  ROUND((SUM(s.revenue) - SUM(COALESCE(r.refund_amount, 0))) / NULLIF(SUM(a.cost), 0), 2) as true_roas
FROM `amazon_ads_sharepoint.keywords_enhanced` a
LEFT JOIN `amazon_seller.amazon_orders_2025` s ON DATE(a.date) = DATE(s.date)
LEFT JOIN `amazon_seller.returns` r ON DATE(a.date) = DATE(r.return_date)
GROUP BY DATE(a.date)
ORDER BY date DESC
```

## Next Steps

1. ✅ Run initial sync with current data
2. ✅ Explore dashboard and verify metrics
3. ✅ Set up automated sync (optional)
4. ✅ Create alerts for high return rates
5. ✅ Integrate with profitability calculations
6. ✅ Add to daily email reports (future)

## Support

For issues or questions:
1. Check this documentation
2. Review sync script output for errors
3. Check BigQuery for data availability
4. Verify API endpoint is accessible

