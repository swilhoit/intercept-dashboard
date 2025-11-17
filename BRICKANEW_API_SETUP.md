# BrickAnew WooCommerce API Setup Instructions

## Critical: Get API Credentials

We need WooCommerce REST API credentials for BrickAnew to fetch the missing 45% of sales data.

### Steps to Generate API Keys:

1. **Login to BrickAnew WooCommerce Admin**
   - URL: https://brickanew.com/wp-admin

2. **Navigate to API Settings**
   - Go to: `WooCommerce` → `Settings` → `Advanced` → `REST API`

3. **Add New Key**
   - Click "Add Key" button
   - Description: "Sales Dashboard API Access"
   - User: Select your admin user
   - Permissions: **Read**
   - Click "Generate API Key"

4. **Copy Credentials**
   - Copy the **Consumer key** (starts with `ck_`)
   - Copy the **Consumer secret** (starts with `cs_`)
   - ⚠️ **IMPORTANT**: You can only see the secret once! Save it immediately.

5. **Add to Credentials File**
   - Open: `/Users/samwilhoit/Documents/sales-dashboard/.env.credentials`
   - Update these lines:
     ```
     BRICKANEW_CONSUMER_KEY=ck_YOUR_KEY_HERE
     BRICKANEW_CONSUMER_SECRET=cs_YOUR_SECRET_HERE
     ```

6. **Test the Connection**
   ```bash
   cd /Users/samwilhoit/Documents/sales-dashboard
   export BRICKANEW_CONSUMER_KEY=ck_YOUR_KEY_HERE
   export BRICKANEW_CONSUMER_SECRET=cs_YOUR_SECRET_HERE
   python3 fetch-woo-data.py brickanew 30
   ```

### Why This Matters

**Current situation:**
- WooCommerce Admin shows: **$31,686.12** (Oct 1-30)
- Our dashboard shows: **$17,537.93**
- **Missing: $14,148 (45% data loss!)**

**Root cause:**
- Our sync only fetches "completed" orders
- Missing "processing" and "on-hold" orders (paid but not shipped)

**After backfill:**
- Dashboard will show accurate revenue
- All paid orders will be included
- No more missing sales data

### Security Note

- Never commit `.env.credentials` to git (it's in .gitignore)
- Store these credentials in Google Cloud Secret Manager for cloud functions
- Use read-only permissions (never "Read/Write")
