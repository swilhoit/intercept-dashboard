# Sales Dashboard - Claude Context

## WooCommerce Sites & Credentials

### 1. BrickAnew (Currently Active)
- **Status**: Already integrated
- **Table**: `woocommerce.brickanew_daily_product_sales`
- **Products**: Fireplace paint kits, renovation products

### 2. Heatilator 
- **Consumer Key**: `ck_b7954d336fa5cbdc4981bb0dcdb3219b7af8cc90`
- **Status**: Needs integration
- **Planned Table**: `woocommerce.heatilator_daily_product_sales`

### 3. Superior
- **Consumer Key**: `ck_fa744f3de5885bbc8e0520e8bee27a8db36b8eff`
- **Status**: Needs integration  
- **Planned Table**: `woocommerce.superior_daily_product_sales`

## Integration Status ✅ COMPLETED

### ✅ Phase 1: Create BigQuery Tables
- ✅ Created `heatilator_daily_product_sales` table with same schema as brickanew
- ✅ Created `superior_daily_product_sales` table with same schema as brickanew
- ✅ Schema: order_date, product_id, product_name, sku, total_quantity_sold, avg_unit_price, total_revenue, order_count

### ✅ Phase 2: Update Data Processing
- ✅ Created `process-multi-woo.py` script to handle all 3 sites
- ✅ Updated cloud function `ecommerce-sync/main.py` to process all sites
- ✅ MASTER.TOTAL_DAILY_SALES now aggregates from all WooCommerce tables

### ✅ Phase 3: Dashboard Integration  
- ✅ Updated `/api/sites/woocommerce/route.ts` to support all 3 tables
- ✅ Modified queries to aggregate data across sites (currently BrickAnew active)
- ✅ Dashboard ready for multiple WooCommerce sites

### ✅ Phase 4: Implementation Ready
- Tables created and ready for data
- API updated to handle multiple sites gracefully
- Processing scripts available for data ingestion
- MASTER table updated to include all sites

## Next Steps for Data Population

1. **Heatilator Data**: Use consumer key `ck_b7954d336fa5cbdc4981bb0dcdb3219b7af8cc90` to fetch WooCommerce API data
2. **Superior Data**: Use consumer key `ck_fa744f3de5885bbc8e0520e8bee27a8db36b8eff` to fetch WooCommerce API data
3. **Run Processing**: Execute `python3 process-multi-woo.py` once data files are available

## Daily Schedulers ✅ CONFIGURED

### Existing Schedulers
- **amazon-daily-sync** - 9:00 AM ET daily
- **shopify-daily-sync** - 2:00 AM UTC daily  
- **woocommerce-daily-sync** - 2:30 AM UTC daily (original single site)
- **ecommerce-combined-sync** - 3:00 AM UTC daily
- **ga4-attribution-daily-sync** - 4:00 AM CT daily

### New Schedulers Created
- **woocommerce-fetch-daily** - 1:00 AM UTC daily (fetches fresh WooCommerce API data)
- **multi-woo-daily-sync** - 3:15 AM UTC daily (processes all 3 WooCommerce sites)
- **amazon-roas-daily** - 5:00 AM UTC daily (calculates ROAS/TACOS metrics)

### Cloud Functions Deployed
- **woocommerce-fetch** - Fetches API data from all WooCommerce sites
- **ecommerce-daily-sync** - Processes and aggregates sales data
- **amazon-roas-calculator** - Calculates ROAS, TACOS, cost per conversion

### Data Flow Schedule
```
1:00 AM UTC - Fetch fresh WooCommerce data from APIs
2:00 AM UTC - Sync Shopify data  
2:30 AM UTC - Sync individual WooCommerce sites
3:00 AM UTC - Combined ecommerce aggregation
3:15 AM UTC - Multi-site WooCommerce processing
4:00 AM UTC - GA4 attribution sync
5:00 AM UTC - Calculate Amazon ROAS/TACOS
9:00 AM ET  - Amazon ads data sync
```

## Current Project
- **GCloud Project**: `intercept-sales-2508061117`
- **BigQuery Dataset**: `woocommerce`
- **All schedulers**: ACTIVE and configured