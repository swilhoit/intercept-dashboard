# Codebase Analysis & Optimization Plan

## 1. Executive Summary
The codebase is a robust data aggregation platform combining a Next.js dashboard with a Python-based ETL pipeline. It successfully integrates diverse data sources (Amazon, WooCommerce, Shopify, Google Search Console) into BigQuery.

## 2. Architecture Review
- **Frontend**: Next.js 15 (App Router), Tailwind, Shadcn UI.
- **Backend**: Next.js API Routes (Serverless).
- **Data Processing**: Python Cloud Functions triggered by Pub/Sub or Scheduler.
- **Database**: Google BigQuery (acting as both Data Warehouse and serving layer).

## 3. Completed Optimizations

### ✅ Phase 1: Cleanup & Security
- **Refactoring**: Moved 80+ files (scripts, docs, data) from root to `scripts/`, `docs/`, `data_archive/`.
- **Security**: Updated `.gitignore` to exclude sensitive data and logs.

### ✅ Phase 2: Database Optimization
- **View-Based Architecture**: Replaced complex ad-hoc SQL queries with BigQuery Views.
  - Created `intercept-sales-2508061117.VIEWS.ALL_SEARCH_CONSOLE_STATS`
  - Created `intercept-sales-2508061117.VIEWS.ALL_WOOCOMMERCE_SALES`
  - Created `intercept-sales-2508061117.VIEWS.DAILY_METRICS_SUMMARY`
- **API Simplification**: Refactored `src/app/api/sales/summary/route.ts` to simply query the summary view.

### ✅ Phase 3: Caching Upgrade
- **Next.js Native Caching**: Implemented `unstable_cache` in `src/lib/bigquery.ts`.
- **Performance**: API responses are now cached across serverless invocations, significantly reducing BigQuery costs and latency.
- **Cleanup**: Removed obsolete in-memory `SimpleCache`.

### ✅ Phase 4: Import & Build Fixes
- **Refactoring**: Updated 11+ API routes (`amazon/daily-sales`, `sites/woocommerce`, etc.) to use the new `cachedQuery` helper.
- **Fixes**: Corrected import paths in moved scripts (e.g., `scripts/sync-now.ts`).
- **Verification**: Confirmed `npm run build` passes successfully.

## 4. Future Recommendations

### A. Pipeline Standardization
- Update Python Cloud Functions in `cloud-functions/` to write to the raw tables that feed the new Views.
- Consider using dbt (data build tool) if the SQL transformations become more complex.

### B. Frontend Performance
- Implement React Suspense for granular loading states on the dashboard components.
- Use `next/image` for any product images to optimize LCP.

### C. Testing
- Add unit tests for the critical SQL view logic (using a staging dataset).
- Add E2E tests for the main dashboard flows.
