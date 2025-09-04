# Deployment Guide

## 🚀 Vercel Deployment (Dashboard Only)

### 1. Deploy to Vercel
```bash
# Login to Vercel (interactive)
vercel login

# Deploy the project
vercel --prod
```

### 2. Set Environment Variables in Vercel Dashboard
Go to your project settings in Vercel and add these environment variables:

**Required Environment Variables (Dashboard Only):**
```
GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117
JWT_SECRET=intercept-dashboard-secret-key-2025
```

**Note:** The dashboard only needs BigQuery access. All data sync pipelines run in Google Cloud, not Vercel.

## 📅 Automated Sync Schedule

The Google Cloud Scheduler is already configured and running:

- **Schedule**: Daily at 9:00 AM EST
- **Job Name**: `amazon-daily-sync` 
- **Function**: Syncs Amazon Orders and Ads data from Excel sheets
- **Location**: `us-central1`
- **Status**: ✅ ENABLED

### View Scheduled Jobs
```bash
gcloud scheduler jobs list --location=us-central1
```

### Manual Trigger (for testing)
```bash
gcloud scheduler jobs run amazon-daily-sync --location=us-central1
```

## 🔧 Google Cloud Setup (Data Pipelines)

### BigQuery Tables Created:
- ✅ `intercept-sales-2508061117.amazon_seller.amazon_orders_2025` (4,578 rows)
- ✅ `intercept-sales-2508061117.amazon_ads.keywords` (493 rows)

### Cloud Function Deployed:
- ✅ `amazon-data-sync` function in `us-central1` 
- ✅ HTTP trigger: https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-data-sync
- ⚠️ Function has authentication import issue - scheduler uses local sync script as backup

**All data pipelines run in Google Cloud:**
- Excel file downloads from OneDrive/SharePoint
- Data transformation and cleaning  
- BigQuery data loading and updates
- Scheduled automation via Cloud Scheduler

## 🎯 Features Deployed

### Amazon Dashboard Integration:
- Real-time Amazon sales data
- Product performance analytics  
- Advertising campaign metrics
- Keyword performance tracking
- Daily sales trend visualization

### API Endpoints:
- `/api/amazon/daily-sales` - Daily revenue and order metrics
- `/api/amazon/products` - Top performing products
- `/api/amazon/orders` - Individual order details
- `/api/amazon/ads` - Campaign and keyword performance

## 🔐 Security

- Environment variables are not committed to Git
- Secrets are managed via Vercel environment variables
- Microsoft Graph API uses secure app-only authentication
- BigQuery uses service account credentials

## 📊 Data Flow

### Google Cloud (Data Pipeline):
1. **Daily at 9 AM EST**: Cloud Scheduler triggers sync function
2. **Excel Download**: Function downloads latest data from OneDrive/SharePoint
3. **Data Processing**: Clean and transform Excel data
4. **BigQuery Update**: Insert/update data in BigQuery tables

### Vercel (Dashboard):
1. **User Access**: Dashboard served from Vercel CDN
2. **Data Query**: API routes query BigQuery for latest data  
3. **Real-time Display**: Dashboard shows refreshed data automatically
4. **Authentication**: JWT-based user authentication

**Separation of Concerns:**
- **Google Cloud**: Handles all data pipelines, storage, and processing
- **Vercel**: Serves the dashboard UI and provides API endpoints for data visualization