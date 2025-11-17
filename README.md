# Sales Intelligence Dashboard

A modern, responsive business intelligence dashboard built with Next.js, TypeScript, shadcn/ui, and Google BigQuery. This dashboard provides real-time insights into your sales data across multiple channels (Amazon and WooCommerce).

## Features

- **Real-time Sales Metrics**: View total revenue, average daily sales, and performance indicators
- **Interactive Charts**: Line charts, bar charts, and pie charts powered by Recharts
- **Date Range Filtering**: Select custom date ranges to analyze specific periods
- **Channel Analysis**: Compare performance between Amazon and WooCommerce
- **Product Analytics**: Track top-performing products by revenue and quantity
- **Responsive Design**: Fully responsive layout that works on desktop, tablet, and mobile
- **Dark Mode Support**: Built-in dark mode with shadcn/ui theming

## Tech Stack

- **Frontend**: Next.js 15.5, React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Charts**: Recharts
- **Database**: Google BigQuery
- **Date Handling**: date-fns, react-day-picker

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google Cloud Project with BigQuery enabled
- Service Account credentials for BigQuery access

### Installation

1. Clone the repository:
```bash
cd /Users/samwilhoit/Documents/sales-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - The `.env.local` file is already configured with your BigQuery credentials
   - Make sure the service account has access to the BigQuery datasets

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to:
```
http://localhost:3002
```

## Dashboard Features

### Overview Tab
- **Stats Cards**: Display key metrics including total revenue, average daily sales, active days, and best performing day
- **Sales Trend Chart**: Interactive line and bar charts showing daily sales trends
- **Channel Breakdown**: Pie chart visualizing revenue distribution between channels

### Products Tab
- **Product Table**: Displays top 20 products by revenue
- **Channel Badges**: Visual indicators for each product's sales channel
- **Revenue and Quantity Metrics**: Track both sales value and units sold

### Analytics Tab
- **Sales Metrics**: Detailed KPIs including average order value and peak sales days
- **Channel Performance**: Progress bars showing revenue contribution by channel
- **Detailed Analysis**: Comprehensive charts for deeper insights

### Amazon Returns Tab
- **Returns Summary**: Track total returns, refund amounts, and return rates
- **Time Series Analysis**: Monitor return trends over time
- **Top Returned Products**: Identify products with highest return rates
- **Return Reasons**: Analyze why customers are returning products
- **Days to Return**: Average time between order and return
- **Financial Impact**: Calculate true profitability after returns

See [AMAZON_RETURNS_SETUP.md](AMAZON_RETURNS_SETUP.md) for detailed setup instructions.

## API Endpoints

The dashboard uses the following API routes:

### Sales
- `GET /api/sales/daily` - Fetch daily sales data with optional date range filtering
- `GET /api/sales/summary` - Get aggregated sales summary statistics
- `GET /api/sales/products` - Retrieve product-level sales data
- `GET /api/sales/monthly` - Fetch monthly sales summaries
- `GET /api/sales/categories` - Category-level sales analysis

### Amazon
- `GET /api/amazon/daily-sales` - Amazon daily sales data
- `GET /api/amazon/products` - Amazon product performance
- `GET /api/amazon/returns` - Amazon returns and refunds data

### Advertising
- `GET /api/amazon/ads-report` - Amazon advertising metrics
- `GET /api/google/ads` - Google Ads performance data

## BigQuery Tables Used

### Master Tables
- `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` - Daily sales totals
- `intercept-sales-2508061117.MASTER.MONTHLY_SALES_SUMMARY` - Monthly aggregates
- `intercept-sales-2508061117.MASTER.TOTAL_PRODUCTS_DAILY_DETAILED_SALES` - Product-level details

### Amazon
- `intercept-sales-2508061117.amazon.orders_jan_2025_present` - Amazon order details (historical)
- `intercept-sales-2508061117.amazon_seller.amazon_orders_2025` - Amazon orders (current)
- `intercept-sales-2508061117.amazon_seller.returns` - Amazon returns and refunds

### WooCommerce
- `intercept-sales-2508061117.woocommerce.*` - WooCommerce stores (BrickAnew, Heatilator, etc.)

### Advertising
- `intercept-sales-2508061117.amazon_ads_sharepoint.keywords_enhanced` - Amazon Ads data
- `intercept-sales-2508061117.google_ads.*` - Google Ads campaigns

## Customization

### Adding New Metrics
1. Update the BigQuery queries in `/src/app/api/sales/`
2. Add new components in `/src/components/dashboard/`
3. Update the main dashboard page at `/src/app/page.tsx`

### Styling
- Modify theme colors in `/src/app/globals.css`
- Customize component styles using Tailwind classes
- Update chart colors in the component files

## Production Deployment

### Build for Production
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

### Deploy to Vercel
```bash
vercel
```

## Performance Optimization

- API routes use parallel data fetching with `Promise.all()`
- Client-side caching for frequently accessed data
- Responsive loading states for better UX
- Optimized BigQuery queries with proper indexing

## Security

- Environment variables stored in `.env.local` (not committed to git)
- Service account credentials with minimal required permissions
- API routes protected against SQL injection
- HTTPS enforced in production

## Support

For issues or questions, please check the following:
1. Ensure BigQuery credentials are properly configured
2. Verify network connectivity to Google Cloud
3. Check browser console for any client-side errors
4. Review API response in Network tab for debugging

## License

Private dashboard for internal business use.