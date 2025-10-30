# Daily Email Report Setup

## ✅ What's Already Done

1. **Cloud Function Created**: `daily-email-report` deployed and working
2. **Cloud Scheduler Configured**: Runs daily at 8:00 AM ET (12:00 UTC)
3. **Report Logic Implemented**:
   - Data freshness checks for all sources
   - Revenue summary by channel
   - Order counts
   - 7-day comparisons
   - Stale data alerts

## 📧 To Enable Email Sending

You need to set up a SendGrid API key to actually send the emails. Here's how:

### Step 1: Create SendGrid Account

1. Go to [https://signup.sendgrid.com/](https://signup.sendgrid.com/)
2. Sign up for a **free account** (allows 100 emails/day)
3. Verify your email address

### Step 2: Create API Key

1. Log into SendGrid dashboard
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"**
4. Name it: `sales-dashboard-reports`
5. Choose **"Restricted Access"**
6. Give it **"Mail Send"** permissions only
7. Click **Create & View**
8. **COPY THE API KEY** (you can't see it again!)

### Step 3: Add API Key to Cloud Function

Run this command with your API key:

```bash
gcloud functions deploy daily-email-report \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=./cloud-functions/daily-email-report \
  --entry-point=daily_email_report \
  --trigger-http \
  --allow-unauthenticated \
  --timeout=540 \
  --memory=512MB \
  --set-env-vars=GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117,FROM_EMAIL=reports@interceptsales.com,TO_EMAIL=samwilhoit@gmail.com,SENDGRID_API_KEY=YOUR_API_KEY_HERE \
  --project=intercept-sales-2508061117
```

Replace `YOUR_API_KEY_HERE` with the actual API key from step 2.

### Step 4: Verify Sender Email (SendGrid Requirement)

SendGrid requires you to verify the "from" email address:

1. In SendGrid dashboard, go to **Settings** → **Sender Authentication**
2. Choose **"Verify a Single Sender"**
3. Enter your email (or use `reports@interceptsales.com` if you own that domain)
4. Check your email and click the verification link

### Step 5: Test the Email

```bash
curl -X POST https://us-central1-intercept-sales-2508061117.cloudfunctions.net/daily-email-report
```

You should receive an email at `samwilhoit@gmail.com` within a few seconds!

## 📊 What the Email Contains

The email includes:

- **Overall Status**: ✅ All Data Current or ⚠️ Some Data Stale
- **Yesterday's Performance**:
  - Total revenue
  - Total orders
  - Comparison to 7-day average
- **Revenue Breakdown by Channel**:
  - Amazon (with order count)
  - WooCommerce (with order count)
  - Shopify
- **Data Freshness Table**:
  - Last update date for each source
  - Days since last update
  - Visual status indicators

## 🎨 Preview

A preview of the HTML email is saved in: `test-email-report.html`

Open it in your browser to see what the daily email will look like!

## ⏰ Email Schedule

- **Time**: 8:00 AM ET (12:00 UTC) every day
- **Cloud Scheduler Job**: `daily-sales-email-report`
- **Status**: ✅ ENABLED and ready to run

## 🔧 Customization Options

### Change Email Time

```bash
gcloud scheduler jobs update http daily-sales-email-report \
  --schedule="0 9 * * *" \
  --time-zone="America/New_York" \
  --location=us-central1 \
  --project=intercept-sales-2508061117
```

(This changes it to 9:00 AM ET)

### Change Recipient Email

```bash
gcloud functions deploy daily-email-report \
  --update-env-vars=TO_EMAIL=newemail@example.com \
  --project=intercept-sales-2508061117
```

### Add Multiple Recipients

Edit `main.py` and change line with `To(TO_EMAIL)` to:

```python
to_emails=[To('email1@example.com'), To('email2@example.com')]
```

## 🚨 Troubleshooting

### Email Not Sending?

1. Check logs:
```bash
gcloud functions logs read daily-email-report --limit=50 --project=intercept-sales-2508061117
```

2. Make sure SendGrid API key is set:
```bash
gcloud functions describe daily-email-report --region=us-central1 --project=intercept-sales-2508061117 | grep SENDGRID_API_KEY
```

3. Verify sender email in SendGrid dashboard

### Test Manually

```bash
curl -X POST https://us-central1-intercept-sales-2508061117.cloudfunctions.net/daily-email-report
```

## 📋 Current Status

✅ Function deployed and working
✅ Scheduler configured (8am ET daily)
✅ Report logic tested with real data
⏳ **Waiting for SendGrid API key to enable email sending**

Once you add the SendGrid API key, emails will start sending automatically every morning at 8 AM ET!
