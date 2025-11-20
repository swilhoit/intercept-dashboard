-- ====================================================================================
-- BigQuery Table Optimization Script
--
-- This script optimizes the main `MASTER.TOTAL_DAILY_SALES` table by applying
-- partitioning. This will improve query performance and reduce costs for the
-- frontend dashboard.
--
-- Instructions:
-- 1. Run Step 1 to create the new, optimized table.
-- 2. Run Step 2 to copy all existing data to the new table.
-- 3. IMPORTANT: Pause all data ingestion that writes to the old table before
--    proceeding to Step 3.
-- 4. Run Step 3 to back up the old table, drop it, and rename the new table.
-- 5. Resume your data ingestion pipelines. They should now write to the newly
--    partitioned table.
-- ====================================================================================

-- Step 1: Create the new partitioned and clustered table
-- We will partition by 'date', which is the most common filter in dashboard queries.
CREATE TABLE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES_OPTIMIZED`
(
  date DATE,
  amazon_sales NUMERIC,
  woocommerce_sales NUMERIC,
  shopify_sales NUMERIC,
  total_sales NUMERIC,
  currency STRING,
  created_at TIMESTAMP
)
PARTITION BY date
OPTIONS(
  description="Partitioned table for all daily sales data",
  partition_expiration_days=1825 -- Keep data for 5 years
);


-- Step 2: Copy data from the old table to the new one
-- This will copy all historical data into the new, partitioned structure.
INSERT INTO `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES_OPTIMIZED`
(
  date,
  amazon_sales,
  woocommerce_sales,
  shopify_sales,
  total_sales,
  currency,
  created_at
)
SELECT
  date,
  amazon_sales,
  woocommerce_sales,
  shopify_sales,
  total_sales,
  currency,
  created_at
FROM
  `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES`;


-- ====================================================================================
-- Step 3: Atomically swap the tables
--
-- WARNING: This step is destructive. Ensure your data ingestion pipelines
-- are paused before running these commands. This is best done during a planned
-- maintenance window.
-- ====================================================================================

-- -- 3a: Back up the old table (optional, but recommended)
-- CREATE SNAPSHOT TABLE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES_BACKUP`
-- CLONE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES`;

-- -- 3b: Drop the original table
-- DROP TABLE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES`;

-- -- 3c: Rename the new table to replace the old one
-- ALTER TABLE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES_OPTIMIZED`
-- RENAME TO TOTAL_DAILY_SALES;
