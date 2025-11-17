"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpIcon, ArrowDownIcon, DollarSign, TrendingUp, MousePointerClick, ShoppingCart, TrendingDown, Target } from "lucide-react"
import { formatCurrency, formatNumber, formatPercentageChange as formatPctChange } from "@/lib/utils"

interface StatsCardsProps {
  totalRevenue: number
  avgDailySales: number
  daysWithSales: number
  highestDay: number
  totalAdSpend?: number
  tacos?: number
  organicClicks?: number
  percentageChanges?: {
    total_revenue?: number
    avg_daily_sales?: number
    totalAdSpend?: number
    organicClicks?: number
  }
  hasComparison?: boolean
}

export function StatsCards({ totalRevenue, avgDailySales, daysWithSales, highestDay, totalAdSpend, tacos, organicClicks, percentageChanges, hasComparison }: StatsCardsProps) {
  const formatPercentageChange = (change: number) => {
    const sign = change > 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600'
    if (change < 0) return 'text-red-600'
    return 'text-muted-foreground'
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <ArrowUpIcon className="h-3 w-3" />
    if (change < 0) return <ArrowDownIcon className="h-3 w-3" />
    return null
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalRevenue, 0)}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Period sales revenue
            </p>
            {hasComparison && percentageChanges?.total_revenue !== undefined && (
              <div className={`flex items-center text-xs ${getChangeColor(percentageChanges.total_revenue)}`}>
                {getChangeIcon(percentageChanges.total_revenue)}
                <span className="ml-1">{formatPercentageChange(percentageChanges.total_revenue)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ad Spend</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalAdSpend || 0, 0)}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Total ad spend
            </p>
            {hasComparison && percentageChanges?.totalAdSpend !== undefined && (
              <div className={`flex items-center text-xs ${getChangeColor(percentageChanges.totalAdSpend)}`}>
                {getChangeIcon(percentageChanges.totalAdSpend)}
                <span className="ml-1">{formatPercentageChange(percentageChanges.totalAdSpend)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">TACOS</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{(tacos || 0).toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            Total Ad Cost of Sales
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Daily Sales</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(avgDailySales, 2)}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Average per day
            </p>
            {hasComparison && percentageChanges?.avg_daily_sales !== undefined && (
              <div className={`flex items-center text-xs ${getChangeColor(percentageChanges.avg_daily_sales)}`}>
                {getChangeIcon(percentageChanges.avg_daily_sales)}
                <span className="ml-1">{formatPercentageChange(percentageChanges.avg_daily_sales)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Organic Clicks</CardTitle>
          <MousePointerClick className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(organicClicks || 0)}</div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Total organic traffic
            </p>
            {hasComparison && percentageChanges?.organicClicks !== undefined && (
              <div className={`flex items-center text-xs ${getChangeColor(percentageChanges.organicClicks)}`}>
                {getChangeIcon(percentageChanges.organicClicks)}
                <span className="ml-1">{formatPercentageChange(percentageChanges.organicClicks)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Best Day</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(highestDay, 0)}</div>
          <p className="text-xs text-muted-foreground">
            Highest single day
          </p>
        </CardContent>
      </Card>
    </div>
  )
}