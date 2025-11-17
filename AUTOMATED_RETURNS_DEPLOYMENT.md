# Amazon Returns - Automated Data Pipeline ✅

**Status**: Fully automated - No manual downloads needed!
**Date**: November 17, 2025

---

## 🎯 What's Been Built

A **fully automated data pipeline** that:
1. ✅ **Downloads** returns data from SharePoint automatically
2. ✅ **Processes** and cleans the data
3. ✅ **Uploads** to BigQuery
4. ✅ **Runs** daily on schedule
5. ✅ **Displays** in dashboard real-time

**NO MANUAL INTERVENTION REQUIRED!**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AUTOMATED DATA PIPELINE                                     │
└─────────────────────────────────────────────────────────────┘

SharePoint Excel File
  📄 amazon returns.xlsx
        ↓
Cloud Scheduler (8 AM daily)
  ⏰ Triggers cloud function
        ↓
Cloud Function: amazon-returns-sync
  🔄 Downloads & processes
        ↓
BigQuery Table
  💾 amazon_seller.returns
        ↓
Dashboard API
  🔌 /api/amazon/returns/summary
        ↓
Dashboard UI
  📊 Returns Impact Card
```

---

## 🚀 Deployment Steps

### Step 1: Deploy the Cloud Function

```bash
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/amazon-returns-sync

# Deploy to Google Cloud
./deploy.sh
```

**What this does**:
- Uploads the function code to Google Cloud
- Sets up authentication with SharePoint
- Configures memory (512MB) and timeout (9 minutes)
- Creates HTTP endpoint for triggering

**Expected output**:
```
✅ Deployment complete!
Function URL: https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync
```

### Step 2: Set Up Daily Schedule

```bash
# Still in the same directory
./setup-scheduler.sh
```

**What this does**:
- Creates Cloud Scheduler job
- Sets to run daily at 8 AM EST
- Configures automatic retry on failure
- Links to the deployed function

**Expected output**:
```
✅ Setup complete! Returns will sync daily at 8 AM.
```

### Step 3: Test It Now

```bash
# Trigger manually to test
gcloud scheduler jobs run amazon-returns-daily --location=us-central1

# Or test function directly
curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync
```

**Expected response**:
```json
{
  "status": "success",
  "returns_processed": 150,
  "total_refunds": 12500.50,
  "date_range": "2024-01-01 to 2025-11-15",
  "message": "Successfully processed 150 returns ($12,500.50 in refunds)"
}
```

### Step 4: Verify in Dashboard

```bash
# Start/refresh your dashboard
npm run dev

# Open browser
open http://localhost:3000/dashboard/overview
```

**What to check**:
- Returns Impact Card shows data
- Net Revenue is calculated
- Return count displayed
- Link to detailed page works

---

## 📋 Prerequisites Check

Before deploying, ensure these are set up:

### 1. Google Cloud Credentials

```bash
# Check if authenticated
gcloud auth list

# Check project
gcloud config get-value project
# Should show: intercept-sales-2508061117
```

### 2. Microsoft SharePoint Credentials

These should already be in Secret Manager:
```bash
# Verify secrets exist
gcloud secrets list | grep microsoft

# Should see:
# microsoft-tenant-id
# microsoft-client-id
# microsoft-client-secret
```

If missing, create them:
```bash
# Add secrets (ask for values if you don't have them)
echo "YOUR_TENANT_ID" | gcloud secrets create microsoft-tenant-id --data-file=-
echo "YOUR_CLIENT_ID" | gcloud secrets create microsoft-client-id --data-file=-
echo "YOUR_CLIENT_SECRET" | gcloud secrets create microsoft-client-secret --data-file=-
```

### 3. BigQuery Dataset

The function will create the table automatically, but verify dataset exists:
```bash
# Check dataset
bq show intercept-sales-2508061117:amazon_seller

# If not exists, create it
bq mk --dataset --location=US intercept-sales-2508061117:amazon_seller
```

---

## 🔧 Configuration

### Change Sync Schedule

Edit the scheduler job:
```bash
# Run every 6 hours instead of daily
gcloud scheduler jobs update http amazon-returns-daily \
  --location=us-central1 \
  --schedule="0 */6 * * *"

# Run daily at 6 AM instead of 8 AM
gcloud scheduler jobs update http amazon-returns-daily \
  --location=us-central1 \
  --schedule="0 6 * * *"
```

### Update SharePoint File

If the file ID changes, update `main.py`:
```python
RETURNS_FILE_CONFIG = {
    'name': 'Amazon Returns',
    'file_id': 'YOUR-NEW-FILE-ID',  # Update this
    'table_id': f'{PROJECT_ID}.amazon_seller.returns',
    'sheet_name': 0
}
```

Then redeploy:
```bash
./deploy.sh
```

---

## 📊 Monitoring

### View Function Logs

```bash
# Recent logs
gcloud functions logs read amazon-returns-sync \
  --region=us-central1 \
  --limit=50

# Follow logs (real-time)
gcloud functions logs read amazon-returns-sync \
  --region=us-central1 \
  --follow
```

### Check Scheduler Status

```bash
# List all jobs
gcloud scheduler jobs list --location=us-central1

# View specific job
gcloud scheduler jobs describe amazon-returns-daily --location=us-central1

# View execution history
gcloud scheduler jobs logs amazon-returns-daily --location=us-central1 --limit=10
```

### Verify Data in BigQuery

```sql
-- Check latest sync
SELECT
  MAX(processed_at) as last_sync,
  COUNT(*) as total_returns,
  SUM(refund_amount) as total_refunds,
  MIN(DATE(return_date)) as earliest_return,
  MAX(DATE(return_date)) as latest_return
FROM `intercept-sales-2508061117.amazon_seller.returns`
```

### Dashboard Health Check

Visit: http://localhost:3000/dashboard/overview

✅ **Healthy signs**:
- Returns Impact Card shows data
- Numbers update with date filter
- No error messages
- Net revenue calculated correctly

❌ **Problem signs**:
- Card shows $0
- "Loading..." stuck
- Error messages
- No data in date range

---

## 🆘 Troubleshooting

### Function Deploy Fails

**Error**: Permission denied
```bash
# Grant necessary permissions
gcloud projects add-iam-policy-binding intercept-sales-2508061117 \
  --member="serviceAccount:YOUR-SERVICE-ACCOUNT" \
  --role="roles/cloudfunctions.admin"
```

**Error**: Secrets not found
```bash
# Verify secrets exist
gcloud secrets list

# Create if missing (see Prerequisites section above)
```

### Scheduler Not Running

**Check if job exists**:
```bash
gcloud scheduler jobs list --location=us-central1
```

**Force run now**:
```bash
gcloud scheduler jobs run amazon-returns-daily --location=us-central1
```

**Check last execution**:
```bash
gcloud scheduler jobs describe amazon-returns-daily --location=us-central1
# Look for "lastAttemptTime" and "status"
```

### No Data in Dashboard

**1. Check if function ran**:
```bash
# View recent executions
gcloud functions logs read amazon-returns-sync --region=us-central1 --limit=10
```

**2. Check BigQuery**:
```sql
SELECT COUNT(*) FROM `intercept-sales-2508061117.amazon_seller.returns`
```

**3. Check API**:
```bash
curl "http://localhost:3000/api/amazon/returns/summary"
```

**4. Check dashboard date range**: Make sure it includes return dates

### SharePoint Authentication Fails

**Error**: "Microsoft credentials not configured"

```bash
# Verify secrets in Secret Manager
gcloud secrets versions access latest --secret="microsoft-tenant-id"
gcloud secrets versions access latest --secret="microsoft-client-id"
gcloud secrets versions access latest --secret="microsoft-client-secret"

# If empty or wrong, update them
```

---

## 💰 Cost Estimate

### Daily Operations

| Component | Usage | Cost/Month |
|-----------|-------|------------|
| Cloud Function | 30 runs/month @ 10s each | $0.01 |
| Cloud Scheduler | 30 jobs/month | $0.30 |
| BigQuery Storage | < 1 GB | $0.02 |
| BigQuery Queries | Dashboard access | $0.10 |
| **Total** | | **~$0.43/month** |

### Cost Optimization

Already optimized! But if you need to reduce:
- Run less frequently (weekly instead of daily)
- Reduce function memory (256MB instead of 512MB)
- Use BigQuery slots reservation (for high usage)

---

## 🎯 What Happens Now

### Daily at 8 AM EST

1. ⏰ Cloud Scheduler wakes up
2. 📡 Triggers the cloud function
3. 🔐 Function authenticates with Microsoft
4. 📥 Downloads latest returns Excel from SharePoint
5. 🔄 Processes and cleans the data
6. 💾 Uploads to BigQuery (replaces old data)
7. ✅ Completes and logs results

### When You Open Dashboard

1. 🌐 Dashboard loads
2. 📊 Calls `/api/amazon/returns/summary`
3. 💾 API queries BigQuery
4. 🔄 Returns cached data (60s TTL)
5. 📈 Returns Impact Card displays
6. ✨ You see latest returns data!

---

## 🔄 Maintenance

### Monthly

- ✅ Check function execution logs
- ✅ Verify data freshness in BigQuery
- ✅ Review cost in GCP console
- ✅ Check for any errors in dashboard

### Quarterly

- ✅ Review and optimize function code
- ✅ Update dependencies if needed
- ✅ Check for SharePoint API changes
- ✅ Validate data accuracy

### Annually

- ✅ Rotate Microsoft credentials
- ✅ Review access permissions
- ✅ Audit data retention policy
- ✅ Performance optimization

---

## 📚 Documentation

### Files Created

```
cloud-functions/amazon-returns-sync/
├── main.py              # Cloud function code
├── requirements.txt     # Python dependencies
├── deploy.sh            # Deployment script
├── setup-scheduler.sh   # Scheduler setup
└── README.md            # Technical docs
```

### Related Docs

- `AMAZON_RETURNS_SETUP.md` - Initial setup guide
- `AMAZON_RETURNS_INTEGRATION_COMPLETE.md` - Full integration
- `RETURNS_DASHBOARD_INTEGRATION.md` - Dashboard features
- `INTEGRATION_SUMMARY.md` - Quick reference
- `AUTOMATED_RETURNS_DEPLOYMENT.md` - This file

---

## ✅ Success Checklist

After deployment, verify:

- [ ] Cloud function deployed successfully
- [ ] Scheduler job created (runs daily at 8 AM)
- [ ] Function can be triggered manually
- [ ] Returns data appears in BigQuery
- [ ] Dashboard shows Returns Impact Card
- [ ] Net revenue calculated correctly
- [ ] Link to detailed page works
- [ ] No errors in logs
- [ ] Costs within expected range (~$0.43/month)
- [ ] Team knows how to monitor

---

## 🎉 You're Done!

**The Amazon returns pipeline is now fully automated!**

### What You Achieved

✅ **Zero manual work** - Data syncs automatically  
✅ **Daily updates** - Fresh data every morning  
✅ **Dashboard integration** - See returns impact immediately  
✅ **Cost efficient** - Less than $0.50/month  
✅ **Reliable** - Runs even if you're on vacation  
✅ **Monitored** - Logs and alerts available  
✅ **Scalable** - Can handle growth easily  

### Next Steps

1. **Monitor for a week** - Ensure daily syncs work
2. **Review the data** - Check for accuracy
3. **Take action** - Use insights to optimize business
4. **Share with team** - Show them the new features
5. **Relax** - It's all automated now! 😎

---

## 🆘 Need Help?

**Check logs first**:
```bash
gcloud functions logs read amazon-returns-sync --region=us-central1 --limit=50
```

**Test manually**:
```bash
curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync
```

**Contact support**:
- Cloud Functions: [GCP Support](https://cloud.google.com/support)
- Dashboard issues: Check browser console
- Data issues: Query BigQuery directly

**Resources**:
- [Cloud Functions Docs](https://cloud.google.com/functions/docs)
- [Cloud Scheduler Docs](https://cloud.google.com/scheduler/docs)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/api/overview)

