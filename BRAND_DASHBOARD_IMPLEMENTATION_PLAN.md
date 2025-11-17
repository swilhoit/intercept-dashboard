# Brand Intelligence Dashboard - Implementation Plan

## 🎯 EXECUTIVE SUMMARY

**Problem**: Selling products for 6-8 fireplace brands with ZERO brand-level analytics  
**Solution**: Brand Intelligence Dashboard  
**Impact**: Optimize $22K/week in revenue by understanding which brands drive profit  
**Effort**: 2-3 days  
**ROI**: High - Will immediately reveal which brands to push vs phase out

---

## 📊 BRAND EXTRACTION STRATEGY

### **Identified Brands in Your Catalog**

From product name analysis, you sell for these brands:

**Primary Brands** (Fireplace Manufacturers):
1. **Heatilator** - Major brand, appears frequently
2. **Superior** / **Superior-Lennox** - High volume
3. **Majestic** - Multiple models
4. **Temco** - Several door models
5. **Martin** - Prefab doors
6. **Heat N Glo** - Specialty models
7. **Marco** - Specific models
8. **Preway** - Niche models

**Your Own Brands**:
9. **BrickAnew** - Paint products (owned brand)
10. **EZ Door** - Your fireplace door brand
11. **WaterWise** - Greywater systems (owned brand)

**Generic/Other**:
12. **Camellia** - Masonry doors
13. **Buckhead** - Masonry doors
14. **Slim Z** - Specific door type

---

## 🔧 TECHNICAL IMPLEMENTATION

### **Step 1: Brand Extraction Function**

Add to `src/lib/utils.ts`:

```typescript
/**
 * Extract brand from product name
 * @param productName - Full product name string
 * @returns Brand name or 'Other'
 */
export function extractBrand(productName: string): string {
  const name = productName.toLowerCase();
  
  // Check for specific brands in priority order
  if (name.includes('heatilator')) return 'Heatilator';
  if (name.includes('superior') || name.includes('lennox')) return 'Superior';
  if (name.includes('majestic')) return 'Majestic';
  if (name.includes('temco')) return 'Temco';
  if (name.includes('martin')) return 'Martin';
  if (name.includes('heat n glo') || name.includes('heat-n-glo')) return 'Heat N Glo';
  if (name.includes('marco')) return 'Marco';
  if (name.includes('preway')) return 'Preway';
  
  // Your own brands
  if (name.includes('brick') || name.includes('paint kit')) return 'BrickAnew';
  if (name.includes('ez door')) return 'EZ Door';
  if (name.includes('waterwise') || name.includes('greywater')) return 'WaterWise';
  
  // Generic brands
  if (name.includes('camellia')) return 'Camellia';
  if (name.includes('buckhead')) return 'Buckhead';
  if (name.includes('slim z')) return 'Slim Z';
  
  return 'Other';
}

/**
 * Get brand color for consistent visualization
 */
export function getBrandColor(brand: string): string {
  const colors: { [key: string]: string } = {
    'Heatilator': '#FF5733',
    'Superior': '#4A90E2',
    'Majestic': '#9B59B6',
    'Temco': '#F39C12',
    'Martin': '#2ECC71',
    'Heat N Glo': '#E74C3C',
    'BrickAnew': '#FF9500',
    'EZ Door': '#3498DB',
    'WaterWise': '#1ABC9C',
    'Other': '#95A5A6'
  };
  return colors[brand] || '#95A5A6';
}
```

---

### **Step 2: Create Brand API Endpoint**

Create `src/app/api/sales/brands/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;

  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Brand extraction CASE statement
    const brandCase = `
      CASE 
        WHEN LOWER(product_name) LIKE '%heatilator%' THEN 'Heatilator'
        WHEN LOWER(product_name) LIKE '%superior%' OR LOWER(product_name) LIKE '%lennox%' THEN 'Superior'
        WHEN LOWER(product_name) LIKE '%majestic%' THEN 'Majestic'
        WHEN LOWER(product_name) LIKE '%temco%' THEN 'Temco'
        WHEN LOWER(product_name) LIKE '%martin%' THEN 'Martin'
        WHEN LOWER(product_name) LIKE '%heat n glo%' OR LOWER(product_name) LIKE '%heat-n-glo%' THEN 'Heat N Glo'
        WHEN LOWER(product_name) LIKE '%marco%' THEN 'Marco'
        WHEN LOWER(product_name) LIKE '%preway%' THEN 'Preway'
        WHEN LOWER(product_name) LIKE '%brick%' OR LOWER(product_name) LIKE '%paint kit%' THEN 'BrickAnew'
        WHEN LOWER(product_name) LIKE '%ez door%' THEN 'EZ Door'
        WHEN LOWER(product_name) LIKE '%waterwise%' OR LOWER(product_name) LIKE '%greywater%' THEN 'WaterWise'
        ELSE 'Other'
      END
    `;

    // Amazon brand sales
    const amazonQuery = `
      SELECT
        ${brandCase} as brand,
        'Amazon' as channel,
        COUNT(DISTINCT product_name) as product_count,
        SUM(total_sales) as revenue,
        SUM(quantity) as units_sold,
        AVG(total_sales / NULLIF(quantity, 0)) as avg_price
      FROM (
        -- Your existing Amazon query logic
      )
      GROUP BY brand, channel
    `;

    // Similar for WooCommerce and Shopify...

    const [brands] = await bigquery.query(finalQuery);
    
    return NextResponse.json({
      brands,
      summary: {
        total_brands: brands.length,
        top_brand: brands[0],
        // Additional metrics
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

### **Step 3: Create Brand Dashboard Component**

Create `src/components/dashboard/brand-performance.tsx`:

```typescript
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, BarChart, Bar, LineChart, Line } from "recharts"
import { Badge } from "@/components/ui/badge"
import { getBrandColor } from "@/lib/utils"

export function BrandPerformance({ dateRange }) {
  // Fetch brand data
  // Transform and visualize

  return (
    <div className="space-y-4">
      {/* Brand Revenue Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {brands.map(brand => (
          <Card key={brand.name}>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <div 
                  className="h-3 w-3 rounded-full" 
                  style={{backgroundColor: getBrandColor(brand.name)}}
                />
                {brand.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(brand.revenue, 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {brand.product_count} products
              </p>
              <p className="text-xs text-green-600">
                {brand.margin}% margin
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Brand Revenue Trend */}
      {/* Brand Market Share */}
      {/* Brand Performance Matrix */}
    </div>
  )
}
```

---

### **Step 4: Create Brand Page**

Create `src/app/dashboard/brands/page.tsx`:

```typescript
"use client"

import { BrandPerformance } from "@/components/dashboard/brand-performance"
import { useDashboard } from "../dashboard-context"

export default function BrandsPage() {
  const { dateRange, selectedChannel } = useDashboard()

  return <BrandPerformance dateRange={dateRange} channel={selectedChannel} />
}
```

---

### **Step 5: Update Navigation**

Add to `src/components/dashboard/sidebar-nav.tsx`:

```typescript
{
  title: "Brands",
  href: "/dashboard/brands",
  icon: Building,
  badge: "NEW"
}
```

---

## 📊 BRAND DASHBOARD MOCKUP

```
┌─────────────────────────────────────────────────────────────┐
│  BRAND PERFORMANCE OVERVIEW                Nov 10-16, 2025  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │🟠Heatilator│Superior  │🟣Majestic│🟡BrickAnew│       │
│  │ $8,240   │ $4,180   │ $2,996   │ $6,748   │       │
│  │ 37%      │ 19%      │ 13%      │ 30%      │       │
│  │ 12 SKUs  │ 8 SKUs   │ 6 SKUs   │ 4 SKUs   │       │
│  │ 52% mar. │ 48% mar. │ 45% mar. │ 62% mar. │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  BRAND REVENUE TRENDS                                  │  │
│  │                                                         │  │
│  │  [Stacked Area Chart showing daily brand performance]  │  │
│  │                                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────┐ ┌───────────────────────────┐   │
│  │ BRAND MARKET SHARE    │ │ BRAND PROFITABILITY       │   │
│  │                       │ │                           │   │
│  │ [Pie Chart]           │ │ [Scatter Plot]            │   │
│  │                       │ │ Revenue vs Margin         │   │
│  └───────────────────────┘ └───────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  BRAND PERFORMANCE DETAILS                           │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ Brand      Revenue  Units  AOV    Margin  TACOS  🔥 │   │
│  │ Heatilator $8,240   28    $294   52%    2.1%   ⭐  │   │
│  │ Superior   $4,180   15    $279   48%    3.2%   ✅  │   │
│  │ Majestic   $2,996   10    $300   45%    2.8%   ✅  │   │
│  │ BrickAnew  $6,748   24    $281   62%    1.8%   ⭐⭐│   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 QUICK WIN: Add Brand Column to Existing Tables

**Immediate Enhancement** (30 minutes):

Add brand badge to product tables:

```typescript
// In product-table.tsx
<TableCell>
  <div className="flex gap-1">
    <Badge className="bg-orange-500">Amazon</Badge>
    <Badge 
      variant="outline" 
      style={{borderColor: getBrandColor(extractBrand(product.product_name))}}
    >
      {extractBrand(product.product_name)}
    </Badge>
  </div>
</TableCell>
```

**Visual Result**:
```
Product Name                          Channel      Brand        Qty  Revenue
Heatilator E36 Doors...              [Amazon]    [Heatilator]   8   $2,152
Superior BC36 Doors...               [Amazon]    [Superior]     6   $1,614
Brick-Anew Paint Kit...              [Amazon]    [BrickAnew]    3   $747
```

---

## 💡 INSIGHT EXAMPLES THIS WILL ENABLE

### **Profitability by Brand**
```
BrickAnew:   $6,748 revenue, 62% margin = $4,183 profit  ⭐ BEST
Heatilator:  $8,240 revenue, 52% margin = $4,285 profit  ⭐ BEST  
Superior:    $4,180 revenue, 48% margin = $2,006 profit  ✅ GOOD
Majestic:    $2,996 revenue, 45% margin = $1,348 profit  ⚠️ OK

💡 INSIGHT: BrickAnew has highest margin despite lower volume!
ACTION: Increase BrickAnew ad spend from $89 to $200/week
```

### **Channel Performance by Brand**
```
Heatilator:  $5,200 Amazon (63%) + $3,040 Direct (37%)
Superior:    $2,900 Amazon (69%) + $1,280 Direct (31%)
BrickAnew:   $3,800 Amazon (56%) + $2,948 Direct (44%)

💡 INSIGHT: BrickAnew performs better on direct sites!
ACTION: Focus BrickAnew marketing on owned properties
```

### **Seasonality by Brand**
```
            Oct    Nov    Dec    Jan
Heatilator  $18K   $32K   $45K   $38K  📈 Peak in Dec
Superior    $12K   $19K   $28K   $24K  📈 Peak in Dec
BrickAnew   $22K   $26K   $24K   $18K  📊 Stable

💡 INSIGHT: Paint (BrickAnew) less seasonal than doors
ACTION: Push paint products in summer months
```

---

## 📈 DASHBOARD METRICS TO ADD

### **Brand KPIs**
1. Revenue by brand
2. Units sold by brand
3. Average order value by brand
4. Conversion rate by brand
5. TACOS by brand
6. Margin % by brand
7. Brand market share (% of total revenue)
8. Brand growth rate (vs previous period)

### **Brand Comparisons**
9. Brand channel split (Amazon vs Direct)
10. Brand category overlap
11. Brand customer acquisition cost
12. Brand repeat purchase rate
13. Brand return rate
14. Brand review ratings

---

## 🎨 UI COMPONENTS NEEDED

### **1. Brand Filter Dropdown**
Add to all pages:
```typescript
<Select>
  <SelectTrigger>
    <SelectValue placeholder="All Brands" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Brands</SelectItem>
    <SelectItem value="heatilator">Heatilator</SelectItem>
    <SelectItem value="superior">Superior</SelectItem>
    <SelectItem value="majestic">Majestic</SelectItem>
    <SelectItem value="brickanew">BrickAnew</SelectItem>
    <SelectItem value="other">Other Brands</SelectItem>
  </SelectContent>
</Select>
```

### **2. Brand Badge Component**
```typescript
export function BrandBadge({ productName }: { productName: string }) {
  const brand = extractBrand(productName);
  const color = getBrandColor(brand);
  
  return (
    <Badge 
      variant="outline"
      style={{ 
        borderColor: color,
        color: color 
      }}
    >
      {brand}
    </Badge>
  );
}
```

### **3. Brand Performance Card**
```typescript
<Card className="border-l-4" style={{borderLeftColor: getBrandColor(brand.name)}}>
  <CardHeader>
    <CardTitle>{brand.name}</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <div className="text-2xl font-bold">{formatCurrency(brand.revenue, 0)}</div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Products:</span>
        <span className="font-medium">{brand.product_count}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Margin:</span>
        <span className="font-medium text-green-600">{brand.margin}%</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">TACOS:</span>
        <span className="font-medium">{brand.tacos}%</span>
      </div>
    </div>
  </CardContent>
</Card>
```

---

## 📊 SAMPLE DATA STRUCTURE

```json
{
  "brands": [
    {
      "name": "Heatilator",
      "revenue": 8240,
      "units": 28,
      "product_count": 12,
      "avg_order_value": 294,
      "margin_percent": 52,
      "tacos": 2.1,
      "channels": {
        "Amazon": 5200,
        "WooCommerce": 3040
      },
      "trend": [
        { "date": "2025-11-10", "revenue": 1180 },
        { "date": "2025-11-11", "revenue": 1420 },
        // ...
      ]
    },
    // ... more brands
  ],
  "summary": {
    "total_brands": 8,
    "top_brand": "Heatilator",
    "fastest_growing": "BrickAnew",
    "highest_margin": "BrickAnew"
  }
}
```

---

## 🎯 PHASED ROLLOUT

### **Phase 1: Basic Brand Tracking** (Day 1)
- ✅ Add `extractBrand()` utility function
- ✅ Create `/api/sales/brands` endpoint
- ✅ Add brand badges to existing product tables
- ✅ Test with current data

### **Phase 2: Brand Dashboard** (Day 2)
- ✅ Create Brand Performance component
- ✅ Add `/dashboard/brands` page
- ✅ Update navigation to include Brands
- ✅ Add brand filter to global controls

### **Phase 3: Brand Intelligence** (Day 3)
- ✅ Add brand-specific TACOS tracking
- ✅ Add brand conversion rate tracking
- ✅ Add brand seasonality charts
- ✅ Implement brand recommendations

---

## 💰 EXPECTED BUSINESS IMPACT

### **Immediate Benefits**
1. **Inventory Optimization**: Stock more of high-margin brands
2. **Ad Spend Efficiency**: Focus ads on brands with best ROAS
3. **Product Development**: Know which brands to expand
4. **Pricing Strategy**: Understand brand price sensitivity

### **Revenue Impact Estimate**
- Better inventory allocation: +$800/week
- Optimized ad spend: +$400/week
- Price optimization: +$300/week
- **Total**: +$1,500/week = **$78K/year**

### **Margin Impact**
- Reduce low-margin brand sales: +3%
- Increase high-margin brand sales: +2%
- **Total margin improvement**: +5% = **$23K/year additional profit**

---

## 🔥 CRITICAL INSIGHTS YOU'RE MISSING NOW

Without brand tracking, you CAN'T answer:

❌ "Which brands should we buy more inventory for?"  
❌ "Are Heatilator products more profitable than Superior?"  
❌ "Which brands convert better on Amazon vs our sites?"  
❌ "Should we create more BrickAnew paint products?"  
❌ "Which brands have highest return rates?"  
❌ "Where should we focus our ad spend by brand?"  

With brand tracking, you CAN answer all of these! ✅

---

## 🎯 RECOMMENDED NEXT STEPS

### **This Week**
1. Implement `extractBrand()` function
2. Add brand badges to product tables
3. Create `/api/sales/brands` endpoint

### **Next Week**
4. Build Brand Performance component
5. Create `/dashboard/brands` page
6. Add brand filtering capability

### **Week 3**
7. Add brand-specific alerts
8. Implement brand recommendations
9. Create brand performance report

---

## 📝 CODE TO ADD TO EXISTING COMPONENTS

### **Update ProductTable to show brands**:

```diff
+ import { extractBrand, getBrandColor } from "@/lib/utils"

  <TableRow>
    <TableCell>{product.product_name}</TableCell>
    <TableCell>
-     <Badge className={getChannelColor(product.channel)}>
-       {product.channel}
-     </Badge>
+     <div className="flex gap-1">
+       <Badge className={getChannelColor(product.channel)}>
+         {product.channel}
+       </Badge>
+       <Badge 
+         variant="outline"
+         style={{borderColor: getBrandColor(extractBrand(product.product_name))}}
+       >
+         {extractBrand(product.product_name)}
+       </Badge>
+     </div>
    </TableCell>
  </TableRow>
```

---

## 🏆 SUCCESS CRITERIA

### **Launch Metrics**
- ✅ Brand dashboard loads in < 2 seconds
- ✅ Shows data for 8-10 identified brands
- ✅ Displays revenue, margin, TACOS for each brand
- ✅ Filterable by brand across all pages
- ✅ Brand trend charts render correctly

### **Business Metrics** (30 days post-launch)
- 📈 Ad spend reallocated based on brand ROAS: +25% efficiency
- 📈 Inventory decisions influenced by brand data: +20% turnover
- 📈 New product decisions backed by brand analysis: 100%
- 📈 Margin improvement through brand optimization: +3-5%

---

**BOTTOM LINE**: Brand intelligence is the #1 missing feature that would transform this dashboard from "sales tracker" to "strategic business tool". 

The data is already there in your product names - you just need to extract and visualize it! 🚀

