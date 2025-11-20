# Verify Returns Impact Card - Troubleshooting Guide

## Current Status

✅ **Data**: Returns data is in BigQuery (150 returns, $32,050 refunds)
✅ **API**: `/api/amazon/returns/summary` is working
✅ **Card**: Component has been updated with better error handling

## Steps to Verify

### 1. Open Dashboard
```bash
# Dashboard should already be running on http://localhost:3000
open http://localhost:3000/dashboard/overview
```

### 2. Check Browser Console
Open browser DevTools (F12 or Cmd+Option+I) and look for these logs:

**You should see:**
```javascript
Overview Page - Returns Data: {
  returnsData: {...},
  accurateAmazonRevenue: 157694.35,
  totalRefunds: 32050.41,
  totalReturns: 150,
  affectedOrders: 150
}

Returns Impact Card Data: {
  totalRevenue: 157694.35,
  totalRefunds: 32050.41,
  totalReturns: 150,
  affectedOrders: 150,
  hasReturnsData: true,
  netRevenue: 125643.94,
  returnImpactPercent: 20.3
}
```

### 3. What You Should See on Dashboard

**Returns Impact Card** should display:
- **Net Revenue**: ~$125,644 (in large green text)
- **Total Refunds**: $32,050 (in red)
- **Return Count**: 150
- **Affected Orders**: 150
- **Revenue Impact**: 20.3% (with orange alert)
- ⚠️ **Alert**: "High return rate - investigate products"

### 4. Visual Check

The card should look like this:

```
┌──────────────────────────────────────┐
│ 📦 Returns Impact          ⚠️         │
│ Amazon returns affecting revenue     │
│                                      │
│ Net Revenue                          │
│ $125,644 ← (Big green number)        │
│ $157,694 - $32,050                   │
│                                      │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━        │
│ 💸 Total Refunds: $32,050            │
│ 📦 Return Count: 150                 │
│ 🛍️ Affected Orders: 150              │
│                                      │
│ Revenue Impact: 20.3%                │
│ ████████████████░░░░ (orange bar)    │
│ ⚠️ High return rate - investigate    │
│                                      │
│ View detailed returns analysis →     │
└──────────────────────────────────────┘
```

## If Card Shows "No returns data yet"

This means `hasReturnsData = false`, which happens when:
- `totalRefunds = 0` AND `totalReturns = 0`

**Check the API**:
```bash
curl http://localhost:3000/api/amazon/returns/summary | python3 -m json.tool
```

**Should return**:
```json
{
    "total_returns": 150,
    "total_refund_amount": 32050.41,
    ...
}
```

**If API returns 0s or error**:
```bash
# Re-sync the data
cd /Users/samwilhoit/Documents/sales-dashboard
python3 sync-amazon-returns.py

# Wait 60 seconds for cache to clear
sleep 60

# Refresh browser
```

## If Card Doesn't Show At All

**Check page layout**:
1. The card is in a 3-column grid
2. It should be the FIRST card (left-most)
3. Next to "Site & Channel Breakdown" and "Performance Summary"

**Check if the overview page loaded**:
Look in browser console for any errors (red text)

## Common Issues

### Issue 1: Card shows but values are $0
**Cause**: API not returning data
**Fix**: 
```bash
# Check API directly
curl http://localhost:3000/api/amazon/returns/summary

# If empty, re-sync:
python3 sync-amazon-returns.py
```

### Issue 2: "No returns data yet" message
**Cause**: Data hasn't loaded or API returned 0
**Fix**: 
```bash
# Check if data exists in BigQuery
bq query --use_legacy_sql=false "
SELECT COUNT(*) FROM \`intercept-sales-2508061117.amazon_seller.returns\`
"

# If 0, re-run sync
python3 sync-amazon-returns.py
```

### Issue 3: Card not visible
**Cause**: CSS/layout issue or wrong date range
**Fix**:
1. Check date range picker at top - make sure it includes Aug-Nov 2025
2. Scroll down on overview page
3. Check browser zoom level (should be 100%)
4. Try different browser

### Issue 4: Console errors
**Look for errors like**:
- "Failed to fetch" → API issue
- "Cannot read property" → Data structure issue
- "404" → Route not found

**Fix**: Share the error in console and I'll help debug

## Force Refresh

Sometimes cache needs clearing:

```bash
# Method 1: Hard refresh browser
# Chrome/Edge: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
# Safari: Cmd+Option+E, then Cmd+R

# Method 2: Clear API cache manually
curl -X POST http://localhost:3000/api/cache/clear

# Method 3: Restart dev server
# Stop with Ctrl+C, then:
npm run dev
```

## Debug Mode

Want more details? Check these:

```javascript
// In browser console, type:
localStorage.setItem('debug', 'true')
// Then refresh page

// To see API responses:
fetch('/api/amazon/returns/summary')
  .then(r => r.json())
  .then(console.log)

// To see current data cache:
// Check Network tab in DevTools
// Filter by "returns"
```

## Success Criteria

✅ Card displays on overview page
✅ Shows Net Revenue in green
✅ Shows Total Refunds in red
✅ Shows return count (150)
✅ Shows orange alert (since 20% > 10%)
✅ Link to detailed page works
✅ No console errors

## Still Having Issues?

1. **Take screenshot** of the dashboard
2. **Copy console logs** (all of them)
3. **Run this diagnostic**:
```bash
echo "=== Returns Data Diagnostic ===" 
echo "BigQuery:"
bq query --use_legacy_sql=false "SELECT COUNT(*), SUM(refund_amount) FROM \`intercept-sales-2508061117.amazon_seller.returns\`"
echo ""
echo "API Response:"
curl -s http://localhost:3000/api/amazon/returns/summary | python3 -m json.tool
echo ""
echo "Dev Server Running:"
ps aux | grep "next dev" | grep -v grep
```

4. **Share the output** and I'll help debug!

## Quick Fix Script

Run this if nothing works:

```bash
#!/bin/bash
cd /Users/samwilhoit/Documents/sales-dashboard

echo "🔧 Fixing Returns Card..."
echo ""

echo "1. Re-syncing data..."
python3 sync-amazon-returns.py

echo ""
echo "2. Testing API..."
curl -s http://localhost:3000/api/amazon/returns/summary | python3 -m json.tool

echo ""
echo "3. Waiting for cache clear (60s)..."
sleep 60

echo ""
echo "✅ Done! Refresh your browser:"
echo "http://localhost:3000/dashboard/overview"
echo ""
echo "Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) for hard refresh"
```

Save as `fix-returns-card.sh`, make executable with `chmod +x fix-returns-card.sh`, then run!

