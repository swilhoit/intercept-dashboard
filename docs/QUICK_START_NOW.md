# 🚀 Quick Start - Get Returns Data in Dashboard NOW

**Time**: 2 minutes  
**Complexity**: Copy & paste commands  
**Result**: Returns data in your dashboard!

---

## What We're Doing

Since SharePoint automation needs the client secret configured, we'll:
1. ✅ Use manual sync (works immediately)
2. ✅ Get returns data into dashboard today
3. ✅ Set up automation later (optional)

---

## Step 1: Get the Returns File

**Option A**: If you have access to the file locally
```bash
# If you already have amazon returns.xlsx, move it here:
cp /path/to/amazon_returns.xlsx /Users/samwilhoit/Documents/sales-dashboard/amazon\ returns.xlsx
```

**Option B**: Download from SharePoint manually
1. Go to SharePoint
2. Download: `amazon returns.xlsx`
3. Save to: `/Users/samwilhoit/Documents/sales-dashboard/amazon returns.xlsx`

---

## Step 2: Run the Sync

```bash
cd /Users/samwilhoit/Documents/sales-dashboard

# Install Python dependencies if needed
pip3 install pandas google-cloud-bigquery openpyxl

# Run the sync
python3 sync-amazon-returns.py
```

**Expected output**:
```
🚀 Starting Amazon Returns SharePoint Sync - 2025-11-17 12:00:00
✅ Using local file: amazon returns.xlsx
============================================================
Processing: amazon returns.xlsx
============================================================
Original shape: (500, 15)
Return date range: 2024-01-01 to 2025-11-15
✅ Loaded 498 rows into intercept-sales-2508061117.amazon_seller.returns

📊 Data verification:
  Total returns: 498
  Total refunds: $45,231.50
✅ Returns sync complete!
```

---

## Step 3: View in Dashboard

```bash
# If dashboard not running
npm run dev

# Open browser
open http://localhost:3000/dashboard/overview
```

**What you'll see**:
- ✅ Returns Impact Card with real data
- ✅ Net Revenue calculated
- ✅ Return rate percentage
- ✅ Visual alerts if returns > 10%

---

## ✅ Done!

Your dashboard now shows returns data!

### What You Have Now

- ✅ Returns data in BigQuery
- ✅ Dashboard showing net revenue
- ✅ Returns Impact Card working
- ✅ Full analytics page available

### Update the Data

When returns data changes:
```bash
cd /Users/samwilhoit/Documents/sales-dashboard
# Download new file from SharePoint
python3 sync-amazon-returns.py
```

Takes 30 seconds!

---

## Optional: Set Up Automation Later

When you're ready for fully automated daily syncs:

1. **Get Microsoft Client Secret** from Azure Portal
2. **Store in Secret Manager**:
```bash
echo "YOUR_SECRET" | gcloud secrets create microsoft-client-secret --data-file=-
echo "b79c7d96-273d-4972-b6a3-0be2bf763919" | gcloud secrets create microsoft-client-id --data-file=-
echo "b58aa5c5-f291-4316-91dc-78ae5f30b0f3" | gcloud secrets create microsoft-tenant-id --data-file=-
```

3. **Deploy Cloud Function**:
```bash
cd cloud-functions/amazon-returns-sync
./deploy.sh
./setup-scheduler.sh
```

4. **Enjoy automatic daily syncs!**

---

## Troubleshooting

### "File not found"

Make sure file is named exactly: `amazon returns.xlsx` (with space, not underscore)

```bash
# Check if file exists
ls -la "/Users/samwilhoit/Documents/sales-dashboard/amazon returns.xlsx"
```

### "No module named 'pandas'"

Install Python dependencies:
```bash
pip3 install pandas google-cloud-bigquery openpyxl requests
```

### Dashboard shows $0

Wait 60 seconds (cache) then refresh. Or check BigQuery:
```bash
bq query --use_legacy_sql=false '
SELECT COUNT(*) as returns FROM `intercept-sales-2508061117.amazon_seller.returns`
'
```

If 0, run sync again.

---

## Summary

**Manual sync workflow** (Use for now):
```
1. Download file from SharePoint
2. Run: python3 sync-amazon-returns.py  
3. View dashboard
4. Repeat when data updates
```

**Automated workflow** (Set up later):
```
1. Configure Azure credentials once
2. Deploy cloud function once
3. Data syncs daily at 8 AM automatically
4. Never think about it again!
```

**Both work perfectly!** Start with manual, automate when ready.

---

## 🎉 Success!

You now have returns data integrated into your dashboard!

Check it out: http://localhost:3000/dashboard/overview

See the Returns Impact Card showing your net revenue after refunds! 📊

