# Microsoft SharePoint Credentials Setup

## Current Status

The Microsoft SharePoint authentication needs the client secret to be configured. Here's how to set it up:

## Option 1: Get Credentials from Azure (Recommended)

### Step 1: Go to Azure Portal

1. Visit: https://portal.azure.com
2. Navigate to **Azure Active Directory** → **App registrations**
3. Find your app (or create new one)

### Step 2: Get the Credentials

You already have:
- **Client ID**: `b79c7d96-273d-4972-b6a3-0be2bf763919`
- **Tenant ID**: `b58aa5c5-f291-4316-91dc-78ae5f30b0f3`

You need:
- **Client Secret**: Create one in Azure Portal
  - Go to **Certificates & secrets**
  - Click **New client secret**
  - Copy the value (you can only see it once!)

### Step 3: Store in Secret Manager

```bash
# Store the client secret
echo "YOUR_CLIENT_SECRET_HERE" | gcloud secrets create microsoft-client-secret --data-file=-

# Store the others (already have values)
echo "b79c7d96-273d-4972-b6a3-0be2bf763919" | gcloud secrets create microsoft-client-id --data-file=-
echo "b58aa5c5-f291-4316-91dc-78ae5f30b0f3" | gcloud secrets create microsoft-tenant-id --data-file=-
```

### Step 4: Grant Permissions

In Azure Portal, ensure your app has:
- **Microsoft Graph** → **Files.Read.All** (Application permission)
- **SharePoint** → **Sites.Read.All** (Application permission)

Then click "Grant admin consent"

## Option 2: Manual File Upload (Temporary)

Until SharePoint is configured, you can manually upload the returns file:

### Step 1: Download from SharePoint

1. Go to your SharePoint site
2. Download: `amazon returns.xlsx`
3. Save to: `/Users/samwilhoit/Documents/sales-dashboard/`

### Step 2: Run Local Sync

```bash
cd /Users/samwilhoit/Documents/sales-dashboard
python3 sync-amazon-returns.py
```

This will upload the file to BigQuery and you'll see returns data in the dashboard!

### Step 3: Update When Needed

Whenever returns data changes:
1. Download new file from SharePoint
2. Run `python3 sync-amazon-returns.py` again

## Option 3: Deploy Without SharePoint (Use Mock Data)

For testing, you can deploy with placeholder secrets:

```bash
# Create placeholder secrets
echo "PLACEHOLDER" | gcloud secrets create microsoft-client-secret --data-file=-
echo "b79c7d96-273d-4972-b6a3-0be2bf763919" | gcloud secrets create microsoft-client-id --data-file=-
echo "b58aa5c5-f291-4316-91dc-78ae5f30b0f3" | gcloud secrets create microsoft-tenant-id --data-file=-

# Deploy the function (will fail to auto-sync but that's ok)
cd cloud-functions/amazon-returns-sync
./deploy.sh

# Use manual sync instead
python3 /Users/samwilhoit/Documents/sales-dashboard/sync-amazon-returns.py
```

Then update secrets later when you have them.

## Recommended Approach

**For now**: Use **Option 2** (Manual Upload)
- Quick to set up
- Works immediately
- See dashboard in action today!

**Later**: Switch to **Option 1** (Azure/Automated)
- Fully automated
- No manual work
- Syncs daily automatically

## Testing

After setup, test the pipeline:

```bash
# If using SharePoint automation
curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync

# If using manual upload
python3 sync-amazon-returns.py

# Then check dashboard
npm run dev
open http://localhost:3000/dashboard/overview
```

## Current Configuration

Based on your `.env.credentials` file:
- ✅ `MICROSOFT_CLIENT_ID`: Configured
- ✅ `MICROSOFT_TENANT_ID`: Configured  
- ❌ `MICROSOFT_CLIENT_SECRET`: **MISSING** - Needed for automation

Note in file: "SharePoint auth currently broken - need to fix or migrate to Amazon Ads API"

## Next Steps

Choose your approach:

**Quick Start (Today)**:
```bash
# Download amazon returns.xlsx from SharePoint
# Place in project root
python3 sync-amazon-returns.py
```

**Full Automation (When Ready)**:
1. Get client secret from Azure
2. Store in Secret Manager
3. Deploy cloud function
4. Enjoy automatic daily syncs!

