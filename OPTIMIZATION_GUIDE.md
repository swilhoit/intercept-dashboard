# 🚀 Dashboard Performance Optimization Guide

## Current Performance Bottlenecks
1. **No caching** - Every page load queries BigQuery
2. **Sequential API calls** - Dashboard makes 5-10 API calls sequentially
3. **Large data transfers** - Sending all historical data on every request
4. **No pagination** - Loading all products/queries at once
5. **Full page re-renders** - No component-level optimization

## Optimization Strategy (Ranked by Impact)

### 1. ⚡ Implement Edge Caching (80% faster)
```typescript
// Add to all API routes
export async function GET(request: NextRequest) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    }
  });
}
```

### 2. 🔄 Use SWR for Client-Side Caching
```bash
npm install swr
```

```typescript
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

function Dashboard() {
  const { data, error, isLoading } = useSWR('/api/sales/summary', fetcher, {
    refreshInterval: 300000, // Refresh every 5 minutes
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })
}
```

### 3. 📊 Optimize BigQuery Queries

#### Current Issues:
- No query result caching
- Scanning full tables
- No partitioning filters

#### Solutions:
```sql
-- Use partitioning
WHERE _PARTITIONDATE BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()

-- Use clustering
CLUSTER BY date, channel

-- Materialized views for summaries
CREATE MATERIALIZED VIEW daily_summary_mv AS
SELECT ... 
REFRESH EVERY 1 HOUR
```

### 4. 🎯 Implement Parallel Data Loading
```typescript
// Instead of sequential:
const sales = await fetch('/api/sales')
const products = await fetch('/api/products')
const traffic = await fetch('/api/traffic')

// Use parallel:
const [sales, products, traffic] = await Promise.all([
  fetch('/api/sales'),
  fetch('/api/products'),
  fetch('/api/traffic')
])
```

### 5. 📦 Code Splitting & Lazy Loading
```typescript
const AdvertisingDashboard = dynamic(
  () => import('@/components/dashboard/advertising-dashboard'),
  { 
    loading: () => <DashboardSkeleton />,
    ssr: false 
  }
)
```

### 6. 🗜️ Data Compression & Pagination
```typescript
// API: Return paginated results
const pageSize = 50;
const offset = (page - 1) * pageSize;
query += ` LIMIT ${pageSize} OFFSET ${offset}`;

// Enable compression
export async function GET() {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    }
  })
}
```

### 7. 🏗️ Implement Loading Skeletons
```typescript
function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-32 bg-gray-200 rounded mb-4" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  )
}
```

### 8. 🔐 Redis/Upstash Caching (Production)
```typescript
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// Cache BigQuery results
const cached = await redis.get(cacheKey)
if (cached) return NextResponse.json(cached)

const data = await bigquery.query(sql)
await redis.set(cacheKey, data, { ex: 300 }) // 5 min TTL
```

### 9. 🌐 Use Vercel Edge Functions
```typescript
export const runtime = 'edge' // Add to API routes
export const revalidate = 300 // ISR - revalidate every 5 minutes
```

### 10. 📈 Monitoring & Metrics
```typescript
// Add performance monitoring
const startTime = performance.now()
const data = await fetchData()
const duration = performance.now() - startTime

console.log(`Query took ${duration}ms`)

// Track with analytics
if (window.gtag) {
  gtag('event', 'timing_complete', {
    name: 'api_call',
    value: Math.round(duration),
    label: endpoint,
  })
}
```

## Quick Wins (Implement Now)

### 1. Add Response Headers
```typescript
// Add to all API routes
headers: {
  'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
  'CDN-Cache-Control': 'max-age=900',
  'Vercel-CDN-Cache-Control': 'max-age=3600',
}
```

### 2. Reduce Initial Data Load
```typescript
// Only load last 7 days initially
const [dateRange, setDateRange] = useState<DateRange>({
  from: subDays(new Date(), 7), // Changed from 30
  to: new Date(),
})
```

### 3. Defer Non-Critical Data
```typescript
useEffect(() => {
  // Load critical data first
  loadSummary()
  
  // Defer secondary data
  setTimeout(() => {
    loadProducts()
    loadTraffic()
  }, 100)
}, [])
```

## Performance Targets
- **Initial Load**: < 2s (currently ~5-8s)
- **API Response**: < 500ms (currently ~2-3s)
- **Time to Interactive**: < 3s (currently ~10s)
- **Lighthouse Score**: > 90 (currently ~60-70)

## Implementation Priority
1. **Day 1**: Cache headers, parallel fetching
2. **Day 2**: SWR implementation, loading skeletons
3. **Day 3**: BigQuery optimization, materialized views
4. **Week 2**: Redis caching, pagination
5. **Week 3**: Code splitting, monitoring

## Estimated Impact
- **50% faster** with caching headers alone
- **70% faster** with SWR + parallel loading
- **90% faster** with full optimization

## Cost Considerations
- BigQuery caching: Saves ~$50-100/month
- Vercel Edge caching: Free tier sufficient
- Redis (Upstash): ~$10/month for 10k requests/day
- CDN: Included with Vercel