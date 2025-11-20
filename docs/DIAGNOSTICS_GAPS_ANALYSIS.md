# Diagnostics Configuration Gaps - October 31, 2025

## Executive Summary

After the recent changes (Google Ads fix, Greywater category addition, Shopify integration), the diagnostics are **NOT** fully aligned with the current system architecture. Several critical gaps exist that could cause false positives/negatives in health monitoring.

---

## Recent Changes That Impact Diagnostics

### 1. Google Ads Tab Fix
- **Changed**: `/api/ads/campaigns` now queries Google Ads tables instead of Amazon Ads tables
- **Tables**: `googleads_brickanew.ads_CampaignBasicStats_4221545789` and `ads_Campaign_4221545789`
- **Impact**: Diagnostics still label this as "Amazon Ads" and don't check Google Ads data sources

### 2. Greywater Category Added
- **Changed**: Added "Greywater" as 4th category throughout dashboard
- **APIs**: `/api/sales/categories` and `/api/sales/category-products`
- **Impact**: Diagnostics don't validate category APIs or check for Greywater category

### 3. Shopify Integration Expanded
- **Changed**: Shopify data now included in category queries
- **Table**: `shopify.waterwise_daily_product_sales_clean`
- **Impact**: Some diagnostics check Shopify, but not comprehensively

---

## Detailed Gap Analysis

### ❌ Gap 1: E2E Diagnostics - Mislabeled Google Ads Endpoint

**File**: `/src/app/api/diagnostics/e2e/route.ts` (Line 66-72)

**Current Code**:
```typescript
{
  name: 'Amazon Ads Campaigns API',  // ❌ WRONG LABEL
  path: '/api/ads/campaigns',
  layer: 'api' as const,
  dataPath: 'campaigns',
  minRecords: 1,
  requiredFields: ['name', 'spend', 'clicks', 'impressions']
}
```

**Issue**: The endpoint is labeled as "Amazon Ads Campaigns API" but now returns **Google Ads** data.

**Impact**:
- Confusing diagnostic reports showing "Amazon Ads" when it's actually Google Ads
- No validation of Google Ads-specific fields like `channelType: 'GOOGLE_ADS'`, `biddingStrategy`, `conversionsValue`

**Fix Needed**:
```typescript
{
  name: 'Google Ads Campaigns API',  // ✅ CORRECT LABEL
  path: '/api/ads/campaigns',
  layer: 'api' as const,
  dataPath: 'campaigns',
  minRecords: 1,
  requiredFields: ['name', 'spend', 'clicks', 'impressions', 'channelType']  // Add channelType validation
}
```

**Additional Validation Needed**:
- Verify `channelType === 'GOOGLE_ADS'` (not 'AMAZON_ADS')
- Check for Google Ads specific fields: `biddingStrategy`, `conversionsValue`
- Validate channel breakdown returns network types like 'SEARCH', 'DISPLAY' (not portfolios)

---

### ❌ Gap 2: Missing Categories API Checks

**Issue**: The diagnostics don't check the categories APIs at all.

**Missing Endpoints**:
1. `/api/sales/categories` - Core category breakdown with Greywater
2. `/api/sales/category-products` - Product categorization

**Impact**:
- Can't detect if categories API is broken
- Can't detect if Greywater category is missing or broken
- Can't detect if Shopify data is excluded from category queries

**Add to E2E** (`e2e/route.ts` line 97):
```typescript
{
  name: 'Sales Categories API',
  path: `/api/sales/categories?startDate=${startDate}&endDate=${endDate}`,
  layer: 'api' as const,
  dataPath: 'categories',
  minRecords: 3, // Should have at least Paint, Fireplace Doors, Other (Greywater if Shopify has data)
  requiredFields: ['name', 'totalSales', 'totalQuantity']
},
{
  name: 'Category Products API',
  path: `/api/sales/category-products?startDate=${startDate}&endDate=${endDate}`,
  layer: 'api' as const,
  dataPath: 'products',
  minRecords: 10, // Should have at least 10 products
  requiredFields: ['product_name', 'category', 'channel', 'total_sales']
}
```

**Additional Validation Needed**:
```typescript
// After fetching categories API
const categoriesRes = await fetch(`${protocol}://${baseUrl}/api/sales/categories?startDate=${startDate}&endDate=${endDate}`);
const categoriesData = await categoriesRes.json();
const categoryNames = Object.keys(categoriesData.categories || {});

// Check for expected categories
const expectedCategories = ['Paint', 'Fireplace Doors', 'Other'];
const missingCategories = expectedCategories.filter(cat => !categoryNames.includes(cat));

if (missingCategories.length > 0) {
  checks.push({
    name: 'Categories API - Category Validation',
    layer: 'integration',
    status: 'error',
    message: `Missing expected categories: ${missingCategories.join(', ')}`,
    dataReturned: false
  });
}

// Check if Greywater category exists (should exist if Shopify has water products)
const hasGreywater = categoryNames.includes('Greywater');
if (!hasGreywater) {
  checks.push({
    name: 'Categories API - Greywater Category',
    layer: 'integration',
    status: 'warning',
    message: 'Greywater category not found (may be expected if no WaterWise sales)',
    dataReturned: true
  });
}

// Validate channel breakdown includes Shopify
const firstCategory = Object.values(categoriesData.categories || {})[0] as any;
if (firstCategory && firstCategory.channelBreakdown) {
  const hasShopify = 'shopify' in firstCategory.channelBreakdown;
  if (!hasShopify) {
    checks.push({
      name: 'Categories API - Shopify Integration',
      layer: 'integration',
      status: 'error',
      message: 'Shopify data missing from channel breakdown',
      dataReturned: false
    });
  }
}
```

---

### ❌ Gap 3: Health Diagnostics - Missing Google Ads Tables

**File**: `/src/app/api/diagnostics/health/route.ts` (Line 20-25)

**Current Tables Checked**:
```typescript
const criticalTables = [
  { dataset: 'MASTER', table: 'TOTAL_DAILY_SALES', description: 'Master sales data', dateColumn: 'date' },
  { dataset: 'MASTER', table: 'TOTAL_DAILY_ADS', description: 'Master ads data', dateColumn: 'date' },
  { dataset: 'amazon_ads_sharepoint', table: 'conversions_orders', description: 'Amazon conversions', dateColumn: 'date' },
  { dataset: 'woocommerce', table: 'brickanew_daily_product_sales', description: 'WooCommerce sales', dateColumn: 'order_date' },
];
```

**Missing Tables**:
1. ❌ `googleads_brickanew.ads_CampaignBasicStats_4221545789` - Google Ads stats (now used by /api/ads/campaigns)
2. ❌ `googleads_brickanew.ads_Campaign_4221545789` - Google Ads campaigns
3. ❌ `shopify.waterwise_daily_product_sales_clean` - Shopify sales (used in categories)
4. ❌ `woocommerce.heatilator_daily_product_sales` - Heatilator WooCommerce
5. ❌ `woocommerce.superior_daily_product_sales` - Superior WooCommerce

**Add to Health Check**:
```typescript
const criticalTables = [
  // ... existing tables ...

  // Google Ads tables (critical for /api/ads/campaigns)
  {
    dataset: 'googleads_brickanew',
    table: 'ads_CampaignBasicStats_4221545789',
    description: 'Google Ads campaign stats',
    dateColumn: 'segments_date'
  },
  {
    dataset: 'googleads_brickanew',
    table: 'ads_Campaign_4221545789',
    description: 'Google Ads campaigns',
    dateColumn: 'campaign_created_at' // or remove date check for this static table
  },

  // Shopify table (critical for categories with Greywater)
  {
    dataset: 'shopify',
    table: 'waterwise_daily_product_sales_clean',
    description: 'Shopify WaterWise sales',
    dateColumn: 'order_date'
  },

  // Additional WooCommerce sites
  {
    dataset: 'woocommerce',
    table: 'heatilator_daily_product_sales',
    description: 'WooCommerce Heatilator',
    dateColumn: 'order_date'
  },
  {
    dataset: 'woocommerce',
    table: 'superior_daily_product_sales',
    description: 'WooCommerce Superior',
    dateColumn: 'order_date'
  }
];
```

**Note**: The `ads_Campaign_4221545789` table may not have a date column (it's a campaign metadata table). Consider adding special handling:
```typescript
// For metadata tables without date columns
if (table === 'ads_Campaign_4221545789') {
  const query = `SELECT COUNT(*) as row_count FROM \`${PROJECT_ID}.${dataset}.${table}\``;
  // Skip last_date check for this table
}
```

---

### ❌ Gap 4: Pipeline Flow - Missing Google Ads Source

**File**: `/src/app/api/diagnostics/pipeline-flow/route.ts` (Line 47-56)

**Current Sources**:
```typescript
const sources = [
  { id: 'amazon-seller-api', name: 'Amazon Seller API', table: 'amazon_seller.amazon_orders_2025' },
  { id: 'amazon-ads-api', name: 'Amazon Ads API', table: 'amazon_ads_sharepoint.keywords_enhanced' },
  { id: 'shopify-api', name: 'Shopify API', table: 'shopify.waterwise_daily_product_sales_clean' },
  { id: 'woo-brickanew', name: 'WooCommerce BrickAnew', table: 'woocommerce.brickanew_daily_product_sales' },
  // ...
];
```

**Issue**: `amazon-ads-api` points to `keywords_enhanced` table, but the Google Ads tab now uses **different tables**:
- `googleads_brickanew.ads_CampaignBasicStats_4221545789`
- `googleads_brickanew.ads_Campaign_4221545789`

**Add Google Ads Source**:
```typescript
const sources = [
  // ... existing sources ...

  // Add Google Ads source
  {
    id: 'google-ads-api',
    name: 'Google Ads API',
    table: 'googleads_brickanew.ads_CampaignBasicStats_4221545789'
  }
];
```

**Update API Dependencies** (Line 210-214):
```typescript
{
  id: 'api-ads-campaigns',
  name: 'Google Ads Campaigns API',  // ✅ Update name
  endpoint: '/api/ads/campaigns',
  dependencies: ['google-ads-api']  // ✅ Change from 'amazon-ads-api' to 'google-ads-api'
}
```

**Add Categories APIs to Pipeline**:
```typescript
const apis = [
  // ... existing APIs ...

  // Add categories APIs
  {
    id: 'api-sales-categories',
    name: 'Sales Categories API',
    endpoint: '/api/sales/categories',
    dependencies: ['amazon-seller-api', 'shopify-api', 'woo-brickanew', 'woo-heatilator', 'woo-superior']
  },
  {
    id: 'api-sales-category-products',
    name: 'Category Products API',
    endpoint: '/api/sales/category-products',
    dependencies: ['amazon-seller-api', 'shopify-api', 'woo-brickanew']
  }
];
```

---

### ⚠️ Gap 5: Integration Checks - No Category Validation

**File**: `/src/app/api/diagnostics/e2e/route.ts` (Line 192-277)

**Current Integration Checks**:
1. Amazon Ads Data Flow ❌ (should be Google Ads now)
2. Sales Data Flow ✅
3. GA4 Analytics Data Flow ✅

**Add Category Data Flow Check** (after line 277):
```typescript
// Check 4: Verify Category data includes Shopify and has Greywater
try {
  const categoriesRes = await fetch(
    `${protocol}://${baseUrl}/api/sales/categories?startDate=${startDate}&endDate=${endDate}`
  );

  if (categoriesRes.ok) {
    const categoriesData = await categoriesRes.json();
    const categories = categoriesData.categories || {};
    const categoryNames = Object.keys(categories);

    const hasGreywater = categoryNames.includes('Greywater');
    const hasShopifyData = Object.values(categories).some((cat: any) =>
      cat.channelBreakdown && cat.channelBreakdown.shopify > 0
    );

    integrationChecks.push({
      name: 'Category & Shopify Data Flow',
      layer: 'integration',
      status: categoryNames.length >= 3 ? 'healthy' : 'warning',
      message: categoryNames.length >= 3
        ? `✓ Categories working (${categoryNames.length} categories${hasGreywater ? ', includes Greywater' : ''}${hasShopifyData ? ', Shopify data present' : ''})`
        : `⚠️ Only ${categoryNames.length} categories found`,
      dataReturned: true
    });
  } else {
    integrationChecks.push({
      name: 'Category & Shopify Data Flow',
      layer: 'integration',
      status: 'error',
      message: '⚠️ Categories API failed',
      dataReturned: false
    });
  }
} catch (error: any) {
  integrationChecks.push({
    name: 'Category & Shopify Data Flow',
    layer: 'integration',
    status: 'error',
    message: `Failed to verify: ${error.message}`,
    dataReturned: false
  });
}
```

**Update Amazon Ads Check to Google Ads** (Line 195-222):
```typescript
// Check 1: Verify Google Ads data flows to dashboard
try {
  const [campaignsRes, metricsRes] = await Promise.all([
    fetch(`${protocol}://${baseUrl}/api/ads/campaigns`),
    fetch(`${protocol}://${baseUrl}/api/ads/master-metrics`)
  ]);

  const campaignsData = campaignsRes.ok ? await campaignsRes.json() : null;
  const hasCampaigns = campaignsData?.campaigns?.length > 0;

  // Verify it's actually Google Ads data (not Amazon)
  const isGoogleAds = campaignsData?.campaigns?.[0]?.channelType === 'GOOGLE_ADS';

  const hasMetrics = metricsRes.ok && (await metricsRes.json()).daily?.length > 0;

  integrationChecks.push({
    name: 'Google Ads Data Flow',  // ✅ Changed from "Amazon Ads"
    layer: 'integration',
    status: hasCampaigns && hasMetrics && isGoogleAds ? 'healthy' : 'error',
    message: hasCampaigns && hasMetrics && isGoogleAds
      ? '✓ Google Ads data flows from BigQuery → API → Dashboard'
      : !isGoogleAds
        ? '⚠️ Campaigns API returning wrong data (not Google Ads)'
        : '⚠️ Google Ads data incomplete or missing',
    dataReturned: hasCampaigns && hasMetrics
  });
} catch (error: any) {
  integrationChecks.push({
    name: 'Google Ads Data Flow',
    layer: 'integration',
    status: 'error',
    message: `Failed to verify data flow: ${error.message}`,
    dataReturned: false
  });
}
```

---

## Priority Recommendations

### 🔴 Critical (Fix Immediately)
1. **Update E2E Diagnostics** - Change "Amazon Ads Campaigns API" label to "Google Ads Campaigns API"
2. **Add Google Ads Source to Pipeline Flow** - Show correct data flow for /api/ads/campaigns
3. **Verify Google Ads channelType in Integration Check** - Ensure it returns 'GOOGLE_ADS' not 'AMAZON_ADS'

### 🟠 High Priority (Fix This Week)
4. **Add Google Ads Tables to Health Check** - Monitor `googleads_brickanew` tables
5. **Add Categories API to E2E Tests** - Validate `/api/sales/categories` and `/api/sales/category-products`
6. **Add Shopify Table to Health Check** - Monitor `shopify.waterwise_daily_product_sales_clean`

### 🟡 Medium Priority (Fix This Month)
7. **Add Category Integration Check** - Verify Greywater category and Shopify data flow
8. **Add Greywater Category Validation** - Ensure Greywater appears when WaterWise has sales
9. **Add Other WooCommerce Sites to Health Check** - Monitor Heatilator and Superior tables

---

## Testing After Updates

### Test 1: Run E2E Diagnostics
```bash
curl http://localhost:3000/api/diagnostics/e2e | jq '.checks[] | select(.name | contains("Google"))'
```
**Expected**: Should see "Google Ads Campaigns API" returning `channelType: 'GOOGLE_ADS'`

### Test 2: Run Health Check
```bash
curl http://localhost:3000/api/diagnostics/health | jq '.tables[] | select(.name | contains("google"))'
```
**Expected**: Should show Google Ads tables with row counts and last update times

### Test 3: Run Pipeline Flow
```bash
curl http://localhost:3000/api/diagnostics/pipeline-flow | jq '.nodes[] | select(.name | contains("Google"))'
```
**Expected**: Should show google-ads-api source node and api-ads-campaigns depending on it

### Test 4: Verify Categories
```bash
curl "http://localhost:3000/api/sales/categories?startDate=2025-10-01&endDate=2025-10-30" | jq '.categories | keys'
```
**Expected**: Should return array including "Greywater" if WaterWise has sales

---

## Summary Table

| Diagnostic | Current Status | Issue | Priority | Fix Needed |
|-----------|---------------|-------|----------|------------|
| E2E - Ads Campaigns Label | ❌ Wrong | Says "Amazon" but returns Google Ads | 🔴 Critical | Change label to "Google Ads Campaigns API" |
| E2E - channelType Check | ❌ Missing | No validation of channelType field | 🔴 Critical | Add `channelType: 'GOOGLE_ADS'` validation |
| E2E - Categories API | ❌ Missing | No categories API checks | 🟠 High | Add `/api/sales/categories` endpoint test |
| E2E - Category Products API | ❌ Missing | No category products checks | 🟠 High | Add `/api/sales/category-products` test |
| E2E - Greywater Validation | ❌ Missing | No Greywater category check | 🟡 Medium | Add category name validation |
| Health - Google Ads Tables | ❌ Missing | No Google Ads table monitoring | 🟠 High | Add `googleads_brickanew.*` tables |
| Health - Shopify Table | ❌ Missing | No Shopify table monitoring | 🟠 High | Add `shopify.waterwise_*` table |
| Health - Other WooCommerce | ❌ Missing | Missing Heatilator & Superior | 🟡 Medium | Add Heatilator & Superior tables |
| Pipeline - Google Ads Source | ❌ Missing | No Google Ads source node | 🔴 Critical | Add google-ads-api source |
| Pipeline - Ads API Dependency | ❌ Wrong | Depends on amazon-ads-api | 🔴 Critical | Change to google-ads-api dependency |
| Pipeline - Categories APIs | ❌ Missing | No categories API nodes | 🟡 Medium | Add categories API nodes |
| Integration - Google Ads Flow | ❌ Wrong | Checks Amazon instead of Google | 🔴 Critical | Update to validate Google Ads data |
| Integration - Category Flow | ❌ Missing | No category data flow check | 🟡 Medium | Add category integration check |

---

**Last Updated**: October 31, 2025
**Status**: ⚠️ DIAGNOSTICS NEED UPDATES
**Impact**: Current diagnostics may report false positives/negatives due to recent architectural changes
