"use client"

import { useState, useEffect, useMemo } from "react"
import { ProductTableWithFilter } from "@/components/dashboard/product-table-with-filter"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDashboard } from "../dashboard-context"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { Package, DollarSign, ShoppingCart, TrendingUp } from "lucide-react"
import { useCachedFetch } from "@/hooks/use-cached-fetch"
import { StatCardSkeleton } from "@/components/dashboard/dashboard-skeleton"

export default function ProductsPage() {
  const { dateRange, selectedChannel } = useDashboard()

  // Fetch products data for summary stats
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    if (selectedChannel !== "all") {
      params.append("channel", selectedChannel)
    }
    return `/api/sales/products?${params.toString()}`
  }, [dateRange, selectedChannel])

  const { data: products, loading } = useCachedFetch<any[]>(apiUrl, { ttl: 120000 })

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (!products || !Array.isArray(products)) {
      return {
        totalProducts: 0,
        totalRevenue: 0,
        totalUnits: 0,
        avgPrice: 0
      }
    }

    const totalRevenue = products.reduce((sum, p) => sum + (p.total_sales || 0), 0)
    const totalUnits = products.reduce((sum, p) => sum + (p.quantity || 0), 0)
    
    return {
      totalProducts: products.length,
      totalRevenue,
      totalUnits,
      avgPrice: totalUnits > 0 ? totalRevenue / totalUnits : 0
    }
  }, [products])

  return (
    <div className="space-y-4">
      {/* Summary Statistics Cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats.totalProducts)}</div>
              <p className="text-xs text-muted-foreground">
                Unique products sold
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue, 0)}</div>
              <p className="text-xs text-muted-foreground">
                From all products
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Units</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats.totalUnits)}</div>
              <p className="text-xs text-muted-foreground">
                Items sold
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Price</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.avgPrice, 2)}</div>
              <p className="text-xs text-muted-foreground">
                Per unit sold
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product Table */}
      <ProductTableWithFilter 
        dateRange={dateRange}
        channel={selectedChannel} 
        hideChannelFilter={true} 
      />
    </div>
  )
}