# Data Fetch Prevention & Recovery Guide

**Last Updated**: October 31, 2025
**Purpose**: Ensure all data fetching operations succeed 100% of the time

---

## 🎯 Critical Lessons Learned

### BrickAnew API Issue (Oct 31, 2025)
**Problem**: API returned 404 errors
**Root Causes**:
1. Domain redirects from `brickanew.com` → `brick-anew.com` (hyphen!)
2. Python requests library blocked by Cloudflare/nginx (no User-Agent header)
3. Only fetching "completed" orders (missing 45% of revenue)

**Solution**:
1. ✅ Updated domain to `https://brick-anew.com`
2. ✅ Added browser-like headers to bypass Cloudflare
3. ✅ Fetch all paid order statuses: `processing,completed,on-hold`

**Impact**: Recovered $15,597.78 in missing October revenue

---

## ✅ Prevention Checklist

### 1. **Always Use Proper Headers**
All WooCommerce API requests MUST include:
```python
headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
}
```

### 2. **Fetch ALL Paid Order Statuses**
Never filter by just `completed`:
```python
params = {
    'status': 'processing,completed,on-hold',  # All paid orders
    ...
}
```

### 3. **Test Domain Redirects**
Before hardcoding domains, test for redirects:
```bash
curl -I https://brickanew.com
# Check for: Location: https://brick-anew.com
```

### 4. **Credentials Management**
- ✅ Master file: `.env.credentials` (never commit to git)
- ✅ Cloud functions: Hardcoded with correct values
- ⏳ TODO: Store in Google Secret Manager once API enabled

### 5. **Automated Testing**
Run this weekly to verify all APIs work:
```bash
python3 test-woo-credentials.py
```

Expected output: All sites show successful API access

---

## 🔧 Files Updated (Oct 31, 2025)

### Local Scripts
1. **`fetch-woo-data.py`**
   - Line 13-15: Corrected BrickAnew domain to `brick-anew.com`
   - Line 74-87: Added Cloudflare bypass headers
   - Line 78: Added all paid order statuses

2. **`.env.credentials`**
   - Line 31: Corrected BrickAnew URL

3. **`test-woo-credentials.py`**
   - Line 9: Corrected BrickAnew domain

### Cloud Functions
4. **`cloud-functions/woo-fetch/main.py`**
   - Line 29: BrickAnew domain already correct ✅
   - Line 78: Added all paid order statuses
   - Line 83-87: Added Cloudflare bypass headers
   - **Deployed**: Oct 31, 2025 3:59 PM UTC

---

## 🚀 Cloud Function Deployment

Whenever updating WooCommerce fetch logic:

```bash
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/woo-fetch

gcloud functions deploy woocommerce-fetch \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=fetch_all_woocommerce \
  --trigger-http \
  --allow-unauthenticated \
  --project=intercept-sales-2508061117
```

**Test after deployment**:
```bash
curl "https://us-central1-intercept-sales-2508061117.cloudfunctions.net/woocommerce-fetch?days_back=1"
```

Should return: `"overall_status": "success"`

---

## 📊 Scheduled Jobs

These run automatically daily:

| Scheduler | Function | Time | Lookback |
|-----------|----------|------|----------|
| `woocommerce-daily-sync` | `woocommerce-fetch` | 2:30 AM UTC | 7 days |
| `shopify-daily-sync` | `shopify-fetch` | 2:00 AM UTC | 30 days |
| `amazon-daily-sync` | `amazon-sync` | 9:00 AM ET | 30 days |

**Check scheduler status**:
```bash
gcloud scheduler jobs list --project=intercept-sales-2508061117
```

**Manually trigger**:
```bash
gcloud scheduler jobs run woocommerce-daily-sync --location=us-central1
```

---

## 🔍 Troubleshooting Guide

### Issue: API Returns 404
**Check**:
1. Domain correct? (check for redirects)
2. WooCommerce REST API enabled on site?
3. Endpoint path correct? (`/wp-json/wc/v3/orders`)

**Fix**: Update domain in both local scripts and cloud function

### Issue: API Returns 403
**Check**:
1. Headers included?
2. Credentials valid?
3. API key has "Read" permissions?

**Fix**: Add User-Agent header + verify credentials

### Issue: Missing Revenue Data
**Check**:
1. Order status filter includes all paid statuses?
2. Date range correct?
3. Lookback window sufficient?

**Fix**: Use `status=processing,completed,on-hold`

### Issue: Cloud Function Timeout
**Check**:
1. Fetching too many days?
2. Site has slow response times?

**Fix**: Reduce `days_back` or increase timeout in function config

---

## 📝 Testing Procedures

### Test Local Script
```bash
export BRICKANEW_URL=https://brick-anew.com
export BRICKANEW_CONSUMER_KEY=ck_917c430be2a325d3ee74d809ca184726130d2fc2
export BRICKANEW_CONSUMER_SECRET=cs_261e146b6578faf1c644e6bf1c3da9a5042abf86

python3 fetch-woo-data.py brickanew 7
```

**Expected**: `✅ Saved X brickanew orders`

### Test Cloud Function
```bash
curl "https://us-central1-intercept-sales-2508061117.cloudfunctions.net/woocommerce-fetch?days_back=1" | python3 -m json.tool
```

**Expected**:
```json
{
  "overall_status": "success",
  "sites": {
    "brickanew": {
      "fetch": {"status": "success", "order_count": N}
    }
  }
}
```

### Verify Data in BigQuery
```bash
bq query --use_legacy_sql=false "
  SELECT MAX(order_date) as latest, COUNT(*) as rows
  FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
"
```

**Expected**: Latest date within 1-2 days of today

---

## 🛡️ Data Quality Monitoring

**Run weekly audit**:
```bash
python3 audit-data-quality.py
```

**Check for**:
- Missing days
- Stale data (>2 days old)
- SQL anti-patterns
- Scheduler failures

**Alert triggers**:
- Any channel >3 days stale → Investigate immediately
- Scheduler disabled → Re-enable
- API errors → Check credentials and domains

---

## 📞 Emergency Recovery

If data fetch fails for multiple days:

1. **Check scheduler logs**:
   ```bash
   gcloud logging read "resource.type=cloud_scheduler_job" \
     --limit=50 \
     --project=intercept-sales-2508061117
   ```

2. **Manually backfill**:
   ```bash
   # Local backfill (30 days)
   python3 fetch-woo-data.py brickanew 30
   python3 process-multi-woo.py brickanew

   # OR trigger cloud function with longer lookback
   curl "https://us-central1-intercept-sales-2508061117.cloudfunctions.net/woocommerce-fetch?days_back=30"
   ```

3. **Verify recovery**:
   ```bash
   # Check BigQuery for filled gaps
   bq query --use_legacy_sql=false "
     SELECT order_date, SUM(total_revenue) as revenue
     FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
     WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
     GROUP BY order_date
     ORDER BY order_date
   "
   ```

---

## ✅ Success Metrics

**Data is healthy when**:
- ✅ All schedulers ENABLED
- ✅ Latest data <2 days old
- ✅ No missing days in past 30 days
- ✅ Cloud function returns "success"
- ✅ Dashboard revenue matches source platforms

**Current Status**: All metrics passing (Oct 31, 2025) ✅

---

## 🔐 Credentials Reference

**Master File**: `/Users/samwilhoit/Documents/sales-dashboard/.env.credentials`

**BrickAnew**:
- URL: `https://brick-anew.com` ⚠️ NOTE THE HYPHEN
- Consumer Key: `ck_917c430be2a325d3ee74d809ca184726130d2fc2`
- Consumer Secret: `cs_261e146b6578faf1c644e6bf1c3da9a5042abf86`

**Heatilator, Superior, Majestic**: See `.env.credentials`

**WaterWise (Shopify)**: See `.env.credentials`

---

## 📚 Related Documentation

- `SYSTEM_STATUS_REPORT.md` - Overall system health
- `DATA_QUALITY_BUGS_REPORT.md` - Historical bug analysis
- `BRICKANEW_API_SETUP.md` - BrickAnew specific setup
- `audit-data-quality.py` - Automated quality checks

---

**Remember**: Test locally first, then deploy to cloud. Always verify after changes!
