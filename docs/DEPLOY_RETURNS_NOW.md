# 🚀 Deploy Amazon Returns Automation - Quick Start

**Time Required**: 5 minutes  
**Manual Work**: None (after deployment)  
**Cost**: ~$0.43/month  

---

## What You're Deploying

A fully automated pipeline that:
1. Downloads returns from SharePoint **automatically**
2. Uploads to BigQuery **automatically**
3. Updates dashboard **automatically**
4. Runs **daily at 8 AM**

**NO MORE MANUAL DOWNLOADS!**

---

## 📋 Pre-Flight Check

Run these commands to verify you're ready:

```bash
# 1. Check you're authenticated
gcloud auth list
# Should show your account

# 2. Check correct project
gcloud config get-value project
# Should show: intercept-sales-2508061117

# 3. Check Microsoft secrets exist
gcloud secrets list | grep microsoft
# Should see: microsoft-tenant-id, microsoft-client-id, microsoft-client-secret
```

✅ **All good?** Continue to deployment!

❌ **Missing something?** See troubleshooting below.

---

## 🚀 Deploy in 2 Steps

### Step 1: Deploy Cloud Function (2 minutes)

```bash
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/amazon-returns-sync

./deploy.sh
```

**Wait for**: "✅ Deployment complete!"

### Step 2: Set Up Daily Schedule (1 minute)

```bash
# Still in same directory
./setup-scheduler.sh
```

**Wait for**: "✅ Setup complete! Returns will sync daily at 8 AM."

---

## ✅ Test It Right Now

```bash
# Trigger a sync immediately
gcloud scheduler jobs run amazon-returns-daily --location=us-central1

# Watch it run (optional)
gcloud functions logs read amazon-returns-sync --region=us-central1 --follow
```

**Expected**: You'll see logs showing data being processed and uploaded.

Press `Ctrl+C` to stop watching logs.

---

## 🎯 Verify It Worked

### 1. Check the Function Response

```bash
curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync
```

**Should see**:
```json
{
  "status": "success",
  "returns_processed": 150,
  "total_refunds": 12500.50,
  "message": "Successfully processed 150 returns..."
}
```

### 2. Check BigQuery

```bash
# Query the data
bq query --use_legacy_sql=false '
SELECT 
  COUNT(*) as total_returns,
  SUM(refund_amount) as total_refunds,
  MAX(processed_at) as last_sync
FROM `intercept-sales-2508061117.amazon_seller.returns`
'
```

**Should see**: Returns count and last sync timestamp

### 3. Check Dashboard

```bash
# If not running, start it
npm run dev

# Open in browser
open http://localhost:3000/dashboard/overview
```

**Should see**: Returns Impact Card with data!

---

## 🎉 Done!

**Your automated returns pipeline is live!**

### What Happens Now:

- ⏰ **Every day at 8 AM**: Returns data automatically syncs
- 📊 **Dashboard updates**: Latest data always available
- 💰 **Cost**: ~$0.43/month (basically free)
- 🛠️ **Maintenance**: Zero (it just works)

### You Can Now:

- ✅ See net revenue (sales minus returns)
- ✅ Track return rates by product
- ✅ Get alerts when returns are high
- ✅ Calculate true profitability
- ✅ Stop advertising bad products

---

## 🔍 Monitoring Commands

### View Recent Logs

```bash
gcloud functions logs read amazon-returns-sync --region=us-central1 --limit=20
```

### Check Scheduler Status

```bash
gcloud scheduler jobs describe amazon-returns-daily --location=us-central1
```

### Manually Trigger Sync

```bash
gcloud scheduler jobs run amazon-returns-daily --location=us-central1
```

### Check Latest Data

```bash
bq query --use_legacy_sql=false '
SELECT MAX(processed_at) as last_sync 
FROM `intercept-sales-2508061117.amazon_seller.returns`
'
```

---

## 🆘 Troubleshooting

### "Secrets not found" Error

**Missing Microsoft credentials?** Create them:

```bash
# You'll need to get these values from Microsoft Azure Portal
echo "YOUR_TENANT_ID" | gcloud secrets create microsoft-tenant-id --data-file=-
echo "YOUR_CLIENT_ID" | gcloud secrets create microsoft-client-id --data-file=-
echo "YOUR_CLIENT_SECRET" | gcloud secrets create microsoft-client-secret --data-file=-
```

Then redeploy:
```bash
./deploy.sh
```

### "Permission denied" Error

**Grant yourself permissions**:

```bash
gcloud projects add-iam-policy-binding intercept-sales-2508061117 \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/cloudfunctions.admin"
```

### Dashboard Shows $0

**Wait 60 seconds** (cache refresh) then reload page.

Still $0? Check if data synced:
```bash
bq query --use_legacy_sql=false '
SELECT COUNT(*) FROM `intercept-sales-2508061117.amazon_seller.returns`
'
```

If 0 rows, trigger sync:
```bash
gcloud scheduler jobs run amazon-returns-daily --location=us-central1
```

### Function Fails

**View error logs**:
```bash
gcloud functions logs read amazon-returns-sync --region=us-central1 --limit=50
```

**Common fixes**:
- File ID wrong → Update in `main.py`
- Sheet name wrong → Update in `main.py`
- Permissions issue → Check SharePoint access

---

## 📚 Full Documentation

For detailed info, see:
- `AUTOMATED_RETURNS_DEPLOYMENT.md` - Complete guide
- `cloud-functions/amazon-returns-sync/README.md` - Technical docs
- `RETURNS_DASHBOARD_INTEGRATION.md` - Dashboard features

---

## ✨ That's It!

You now have a **fully automated returns tracking system**.

No more manual downloads. No more spreadsheets. Just data flowing automatically into your dashboard every day.

**Enjoy!** 🎊

