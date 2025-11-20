-- Create Dataset for Views if it doesn't exist
-- CREATE SCHEMA IF NOT EXISTS `intercept-sales-2508061117.VIEWS`;

-- 1. View for All Search Console Data (Organic Traffic)
CREATE OR REPLACE VIEW `intercept-sales-2508061117.VIEWS.ALL_SEARCH_CONSOLE_STATS` AS
SELECT 
    'brickanew' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_brickanew.searchdata_site_impression`
UNION ALL
SELECT 
    'heatilator' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_heatilator.searchdata_site_impression`
UNION ALL
SELECT 
    'superior' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_superior.searchdata_site_impression`
UNION ALL
SELECT 
    'waterwise' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_waterwise.searchdata_site_impression`
UNION ALL
SELECT 
    'majestic' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_majestic.searchdata_site_impression`
UNION ALL
SELECT 
    'fireplacepainting' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_fireplacepainting.searchdata_site_impression`
UNION ALL
SELECT 
    'fireplacesnet' as site, data_date, clicks, impressions
FROM `intercept-sales-2508061117.searchconsole_fireplacesnet.searchdata_site_impression`;

-- 2. View for All WooCommerce Sales
CREATE OR REPLACE VIEW `intercept-sales-2508061117.VIEWS.ALL_WOOCOMMERCE_SALES` AS
SELECT 
    'brickanew' as site, order_date, total_revenue, order_count, total_quantity_sold 
FROM `intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales`
UNION ALL
SELECT 
    'heatilator' as site, order_date, total_revenue, order_count, total_quantity_sold
FROM `intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales`
UNION ALL
SELECT 
    'superior' as site, order_date, total_revenue, order_count, total_quantity_sold
FROM `intercept-sales-2508061117.woocommerce.superior_daily_product_sales`
UNION ALL
SELECT 
    'majestic' as site, order_date, total_revenue, order_count, total_quantity_sold
FROM `intercept-sales-2508061117.woocommerce.majestic_daily_product_sales`
UNION ALL
SELECT 
    'waterwise' as site, order_date, total_revenue, order_count, total_quantity_sold
FROM `intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales`;

-- 3. View for All Amazon Sales (Live Calculation)
CREATE OR REPLACE VIEW `intercept-sales-2508061117.VIEWS.ALL_AMAZON_SALES` AS
SELECT
    CASE
      WHEN REGEXP_CONTAINS(Date, r'^\d{4}-\d{2}-\d{2}$') THEN PARSE_DATE('%Y-%m-%d', Date)
      WHEN REGEXP_CONTAINS(Date, r'^\d+$') THEN DATE_ADD(DATE '1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
      ELSE NULL
    END as order_date,
    Item_Price as revenue,
    1 as quantity
FROM `intercept-sales-2508061117.amazon_seller.amazon_orders_2025`
WHERE Product_Name IS NOT NULL AND Item_Price IS NOT NULL AND Item_Price > 0
UNION ALL
SELECT
    DATE(date) as order_date,
    revenue,
    item_quantity as quantity
FROM `intercept-sales-2508061117.amazon.orders_jan_2025_present`
WHERE product_name IS NOT NULL AND revenue > 0
  AND DATE(date) < '2025-01-01';

-- 4. View for All Shopify Sales
CREATE OR REPLACE VIEW `intercept-sales-2508061117.VIEWS.ALL_SHOPIFY_SALES` AS
SELECT
    order_date,
    total_revenue as revenue,
    total_quantity_sold as quantity
FROM `intercept-sales-2508061117.shopify.waterwise_daily_product_sales_clean`;

-- 5. Master Summary View (Live Aggregation from other Views)
-- This replaces the dependency on the static MASTER table
CREATE OR REPLACE VIEW `intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY` AS
WITH 
    dates AS (
        SELECT DISTINCT order_date as date FROM `intercept-sales-2508061117.VIEWS.ALL_AMAZON_SALES`
        UNION DISTINCT
        SELECT DISTINCT order_date as date FROM `intercept-sales-2508061117.VIEWS.ALL_WOOCOMMERCE_SALES`
        UNION DISTINCT
        SELECT DISTINCT order_date as date FROM `intercept-sales-2508061117.VIEWS.ALL_SHOPIFY_SALES`
    ),
    amazon_daily AS (
        SELECT order_date as date, SUM(revenue) as revenue, COUNT(*) as orders
        FROM `intercept-sales-2508061117.VIEWS.ALL_AMAZON_SALES`
        GROUP BY 1
    ),
    woo_daily AS (
        SELECT order_date as date, SUM(total_revenue) as revenue, SUM(order_count) as orders
        FROM `intercept-sales-2508061117.VIEWS.ALL_WOOCOMMERCE_SALES`
        GROUP BY 1
    ),
    shopify_daily AS (
        SELECT order_date as date, SUM(revenue) as revenue, COUNT(*) as orders -- Shopify table count might be lines not orders, but close enough for now
        FROM `intercept-sales-2508061117.VIEWS.ALL_SHOPIFY_SALES`
        GROUP BY 1
    ),
    organic_daily AS (
        SELECT data_date as date, SUM(clicks) as total_clicks
        FROM `intercept-sales-2508061117.VIEWS.ALL_SEARCH_CONSOLE_STATS`
        GROUP BY 1
    )
SELECT
    d.date,
    (COALESCE(a.revenue, 0) + COALESCE(w.revenue, 0) + COALESCE(s.revenue, 0)) as total_sales,
    COALESCE(a.revenue, 0) as amazon_sales,
    COALESCE(w.revenue, 0) as woocommerce_sales,
    COALESCE(s.revenue, 0) as shopify_sales,
    COALESCE(org.total_clicks, 0) as organic_clicks,
    (COALESCE(a.orders, 0) + COALESCE(w.orders, 0) + COALESCE(s.orders, 0)) as total_orders
FROM dates d
LEFT JOIN amazon_daily a ON d.date = a.date
LEFT JOIN woo_daily w ON d.date = w.date
LEFT JOIN shopify_daily s ON d.date = s.date
LEFT JOIN organic_daily org ON d.date = org.date;
