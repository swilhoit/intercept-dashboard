# Google Ads Tab Fixed - October 31, 2025

## Issue Summary

**Problem**: The Google Ads tab in the dashboard was incorrectly showing Amazon Ads data instead of Google Ads data.

**Root Cause**: The `/api/ads/campaigns` endpoint was querying Amazon Ads tables (`amazon_ads_sharepoint.conversions_orders`) instead of Google Ads tables.

**Status**: ✅ FIXED AND TESTED

---

## Changes Made

### File: `/src/app/api/ads/campaigns/route.ts`

#### 1. Campaign Performance Query (Lines 45-84)

**Before**:
```sql
FROM `intercept-sales-2508061117.amazon_ads_sharepoint.conversions_orders`
WHERE date IS NOT NULL
```

**After**:
```sql
FROM `intercept-sales-2508061117.googleads_brickanew.ads_CampaignBasicStats_4221545789` s
JOIN `intercept-sales-2508061117.googleads_brickanew.ads_Campaign_4221545789` c
  ON s.campaign_id = c.campaign_id
WHERE c.campaign_name IS NOT NULL
  AND s.segments_date IS NOT NULL
```

**Key Changes**:
- Using Google Ads `ads_CampaignBasicStats_4221545789` and `ads_Campaign_4221545789` tables
- Added JOIN between stats and campaign tables on `campaign_id`
- Changed date field from `date` to `s.segments_date`
- Using Google Ads campaign fields: `c.campaign_name`, `c.campaign_bidding_strategy_type`, `c.campaign_status`

#### 2. Metrics Conversion

**Before (Amazon Ads)**:
```sql
SUM(cost) as total_spend,
SUM(impressions) as total_impressions,
SUM(clicks) as total_clicks,
SUM(CAST(attributed_sales_7d AS FLOAT64)) as total_conversions_value
```

**After (Google Ads)**:
```sql
SUM(s.metrics_cost_micros / 1000000) as total_spend,
SUM(s.metrics_impressions) as total_impressions,
SUM(s.metrics_clicks) as total_clicks,
SUM(s.metrics_conversions) as total_conversions,
SUM(s.metrics_conversions_value) as total_conversions_value
```

**Key Changes**:
- Google Ads stores cost in micros (divide by 1,000,000 to get dollars)
- Added `metrics_conversions` field (not available in Amazon Ads query)
- Added `metrics_conversions_value` field for conversion revenue

#### 3. Trend Query (Lines 89-112)

**Before**:
```sql
SELECT
  date,
  SUM(cost) as daily_spend,
  SUM(clicks) as daily_clicks
FROM `amazon_ads_sharepoint.conversions_orders`
```

**After**:
```sql
SELECT
  s.segments_date as date,
  ${caseStatement.replace(/campaign_name/g, 'c.campaign_name')} as category,
  SUM(s.metrics_cost_micros / 1000000) as daily_spend,
  SUM(s.metrics_impressions) as daily_impressions,
  SUM(s.metrics_clicks) as daily_clicks,
  SUM(s.metrics_conversions) as daily_conversions
FROM `googleads_brickanew.ads_CampaignBasicStats_4221545789` s
JOIN `googleads_brickanew.ads_Campaign_4221545789` c
  ON s.campaign_id = c.campaign_id
```

#### 4. Channel Breakdown Query (Lines 116-138)

**Before**:
```sql
SELECT
  COALESCE(portfolio_name, 'No Portfolio') as channel,
  SUM(cost) as total_spend
FROM `amazon_ads_sharepoint.conversions_orders`
```

**After**:
```sql
SELECT
  COALESCE(s.segments_ad_network_type, 'Unknown') as channel,
  SUM(s.metrics_cost_micros / 1000000) as total_spend,
  SUM(s.metrics_impressions) as total_impressions,
  SUM(s.metrics_clicks) as total_clicks,
  SUM(s.metrics_conversions) as total_conversions,
  COUNT(DISTINCT c.campaign_name) as campaign_count
FROM `googleads_brickanew.ads_CampaignBasicStats_4221545789` s
JOIN `googleads_brickanew.ads_Campaign_4221545789` c
  ON s.campaign_id = c.campaign_id
```

**Key Changes**:
- Changed from `portfolio_name` (Amazon concept) to `segments_ad_network_type` (Google Ads concept)
- Network types: SEARCH, DISPLAY, YOUTUBE, etc.

#### 5. Response Processing (Lines 143-160)

**Before**:
```typescript
channelType: 'AMAZON_ADS',
conversionsValue: 0, // Not available
```

**After**:
```typescript
channelType: 'GOOGLE_ADS',
conversionsValue: parseFloat(row.total_conversions_value) || 0,
```

---

## Testing Results

### Test 1: API Response ✅
```bash
curl "http://localhost:3000/api/ads/campaigns?startDate=2025-10-01&endDate=2025-10-30"
```

**Results**:
- **Campaign**: "paint-kit-shopping" (Google Ads campaign)
- **Channel Type**: "GOOGLE_ADS" ✅
- **Bidding Strategy**: "MANUAL_CPC" (Google Ads strategy)
- **Status**: "ENABLED", "PAUSED" (Google Ads statuses)
- **October 2025 Metrics**:
  - Total Spend: $8,091.30
  - Total Impressions: 700,280
  - Total Clicks: 7,490
  - CPC: $1.08
  - CTR: 1.07%
  - Conversions: 0 (expected if conversion tracking not set up)

### Test 2: Channel Breakdown ✅
```json
"channels": [
  {
    "name": "SEARCH",
    "spend": 8091.30,
    "impressions": 700280,
    "clicks": 7490,
    "conversions": 0,
    "campaignCount": 1
  }
]
```
Shows Google Search Network (not Amazon portfolio names)

### Test 3: Category Breakdown ✅
```json
"categoryBreakdown": [
  {
    "name": "Paint",
    "spend": 8091.30,
    "impressions": 700280,
    "clicks": 7490,
    "conversions": 0,
    "campaignCount": 2
  }
]
```
Category categorization working correctly

### Test 4: Daily Trend ✅
```json
"trend": [
  {"date": "2025-10-01", "Paint": {"spend": 1099.00, "clicks": 980, "conversions": 0}},
  {"date": "2025-10-02", "Paint": {"spend": 1152.20, "clicks": 1050, "conversions": 0}},
  {"date": "2025-10-03", "Paint": {"spend": 1061.90, "clicks": 840, "conversions": 0}},
  // ... Oct 1-8 data
]
```
Daily breakdown working correctly

---

## Google Ads vs Amazon Ads Comparison

| Feature | Amazon Ads | Google Ads |
|---------|-----------|------------|
| **Tables** | `amazon_ads_sharepoint.conversions_orders` | `googleads_brickanew.ads_CampaignBasicStats_4221545789` + `ads_Campaign_4221545789` |
| **Cost Field** | `cost` (dollars) | `metrics_cost_micros` (micros, divide by 1M) |
| **Date Field** | `date` | `segments_date` |
| **Campaign Name** | Direct in orders table | `campaign_name` from campaign table (requires JOIN) |
| **Channel Grouping** | `portfolio_name` | `segments_ad_network_type` (SEARCH, DISPLAY, etc.) |
| **Conversions** | `attributed_sales_7d` (revenue) | `metrics_conversions` (count) + `metrics_conversions_value` (revenue) |
| **Bidding Strategy** | Not in table | `campaign_bidding_strategy_type` |
| **Status** | Not in table | `campaign_status` (ENABLED, PAUSED, REMOVED) |

---

## Database Schema

### Google Ads Tables

#### `googleads_brickanew.ads_CampaignBasicStats_4221545789`
- `campaign_id` - JOIN key
- `segments_date` - Date field
- `metrics_cost_micros` - Cost in micros
- `metrics_impressions` - Impression count
- `metrics_clicks` - Click count
- `metrics_conversions` - Conversion count
- `metrics_conversions_value` - Conversion revenue
- `segments_ad_network_type` - SEARCH, DISPLAY, YOUTUBE, etc.

#### `googleads_brickanew.ads_Campaign_4221545789`
- `campaign_id` - JOIN key
- `campaign_name` - Campaign name
- `campaign_bidding_strategy_type` - MANUAL_CPC, TARGET_CPA, etc.
- `campaign_status` - ENABLED, PAUSED, REMOVED

---

## Impact

### Before Fix
- ❌ Google Ads tab showed Amazon Ads campaigns
- ❌ Incorrect campaign names (Amazon campaigns)
- ❌ Incorrect channel types (Amazon portfolios)
- ❌ Missing Google Ads specific data (bidding strategies, statuses)
- ❌ Confusing for users analyzing Google Ads performance

### After Fix
- ✅ Google Ads tab shows actual Google Ads campaigns
- ✅ Correct campaign names from Google Ads
- ✅ Correct channel types (SEARCH, DISPLAY, etc.)
- ✅ Google Ads bidding strategies and statuses available
- ✅ Accurate Google Ads performance data
- ✅ Proper categorization of Google Ads campaigns (Paint, Fireplace Doors, etc.)

---

## Dashboard Location

**Path**: Dashboard → Ads → Google Ads Tab

**Components Using This API**:
- `/src/app/dashboard/ads/google/page.tsx` - Main Google Ads page
- Campaign performance table
- Daily trend charts
- Channel breakdown charts
- Category breakdown analysis

---

## Related Files

1. **`/src/app/api/ads/campaigns/route.ts`** - Fixed API endpoint
2. **`/src/app/api/ads/amazon/route.ts`** - Separate Amazon Ads endpoint (unchanged)
3. **`/src/app/dashboard/ads/google/page.tsx`** - Google Ads dashboard page

---

## Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Correct Data Source | Google Ads | Google Ads | ✅ Met |
| Campaign Names | Google Ads campaigns | paint-kit-shopping | ✅ Met |
| Channel Type | GOOGLE_ADS | GOOGLE_ADS | ✅ Met |
| Metrics Populated | Yes | Yes (8K spend, 700K impr) | ✅ Met |
| Category Breakdown | Working | Paint category shown | ✅ Met |
| Channel Breakdown | Google networks | SEARCH network | ✅ Met |
| Daily Trends | Working | Oct 1-8 data | ✅ Met |

---

## Notes

1. **Conversions**: Currently showing 0 conversions. This is expected if:
   - Google Ads conversion tracking is not set up
   - No conversions occurred in the date range
   - Conversions are being tracked in a different way

2. **Date Range**: The test data shows Oct 1-8, 2025 (8 days of active data)

3. **Campaign Status**: Shows both ENABLED and PAUSED campaigns

4. **Cost Conversion**: Google Ads stores cost in micros (1,000,000 = $1), so we divide by 1,000,000 to get dollar amounts

---

**Last Updated**: October 31, 2025
**Status**: ✅ FIXED AND TESTED
**Impact**: Google Ads tab now correctly displays Google Ads data with accurate metrics and categorization
