"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell } from "recharts"
import { DateRange } from "react-day-picker"
import { DollarSign, MousePointer, Eye, Target, TrendingUp, Zap } from "lucide-react"
import { AdvertisingDashboard } from "./advertising-dashboard"
import { AmazonAdsReport } from "./amazon-ads-report"
import { ErrorBoundary } from "@/components/error-boundary"
import { safeNumber } from "@/lib/data-validation"
import { useCachedFetchMultiple } from "@/hooks/use-cached-fetch"

interface CombinedAdvertisingDashboardProps {
  dateRange?: DateRange
}

export function CombinedAdvertisingDashboard({ dateRange }: CombinedAdvertisingDashboardProps) {
  // Build API URLs with parameters
  const apiUrls = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    const amazonParams = new URLSearchParams(params)
    amazonParams.append("timeSeries", "true")

    return [
      { url: `/api/ads/campaigns?${params.toString()}`, critical: true, ttl: 60000 },
      { url: `/api/amazon/ads-report?${amazonParams.toString()}`, critical: true, ttl: 60000 },
    ]
  }, [dateRange])

  const { data: apiData, loading } = useCachedFetchMultiple(apiUrls)

  const googleData = apiData[apiUrls[0].url] || { summary: {}, trend: [], channels: [] }
  const amazonData = apiData[apiUrls[1].url] || { summary: {}, timeSeries: [] }

  const formatCurrency = (value: number, decimals: number = 0) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  const formatCurrencyAxis = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}k`
    }
    return `$${Math.round(value)}`
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  const formatPercent = (value: number) => {
    return `${value?.toFixed(2) || 0}%`
  }

  // Combined metrics with safe number conversion
  const combinedMetrics = {
    totalSpend: safeNumber(googleData.summary?.totalSpend) + safeNumber(amazonData.summary?.total_cost),
    totalClicks: safeNumber(googleData.summary?.totalClicks) + safeNumber(amazonData.summary?.total_clicks),
    totalImpressions: safeNumber(googleData.summary?.totalImpressions) + safeNumber(amazonData.summary?.total_impressions),
    totalConversions: safeNumber(googleData.summary?.totalConversions) + safeNumber(amazonData.summary?.total_conversions),
    totalConversionsValue: safeNumber(googleData.summary?.totalConversionsValue) + safeNumber(amazonData.summary?.total_conversions_value),
    googleSpend: safeNumber(googleData.summary?.totalSpend),
    amazonSpend: safeNumber(amazonData.summary?.total_cost)
  }

  // Platform comparison data
  const platformComparison = [
    {
      platform: 'Google Ads',
      spend: googleData.summary?.totalSpend || 0,
      clicks: googleData.summary?.totalClicks || 0,
      impressions: googleData.summary?.totalImpressions || 0,
      conversions: googleData.summary?.totalConversions || 0,
      color: '#4285F4'
    },
    {
      platform: 'Amazon Ads',
      spend: amazonData.summary?.total_cost || 0,
      clicks: amazonData.summary?.total_clicks || 0,
      impressions: amazonData.summary?.total_impressions || 0,
      conversions: amazonData.summary?.total_conversions || 0,
      color: '#FF9900'
    }
  ]

  // Combined time series data
  const combinedTimeSeries = () => {
    const googleTrend = googleData.trend || []
    const amazonTimeSeries = amazonData.timeSeries || []

    // Create a map of dates for easier merging
    const dateMap = new Map()

    // Add Google data
    googleTrend.forEach((item: any) => {
      const date = item.date?.value || item.date
      // Skip entries with null/undefined dates
      if (!date) return

      if (!dateMap.has(date)) {
        dateMap.set(date, { date, googleSpend: 0, amazonSpend: 0, totalSpend: 0 })
      }
      const dayData = dateMap.get(date)
      // Sum all categories for Google
      Object.keys(item).forEach(key => {
        if (key !== 'date' && item[key]?.spend) {
          dayData.googleSpend += item[key].spend
        }
      })
    })

    // Add Amazon data
    amazonTimeSeries.forEach((item: any) => {
      const date = item.date
      // Skip entries with null/undefined dates
      if (!date) return

      if (!dateMap.has(date)) {
        dateMap.set(date, { date, googleSpend: 0, amazonSpend: 0, totalSpend: 0 })
      }
      const dayData = dateMap.get(date)
      dayData.amazonSpend = item.spend || 0
    })

    // Calculate totals and return sorted array, filtering out any null dates
    return Array.from(dateMap.values())
      .filter(item => item.date != null)
      .map(item => ({
        ...item,
        totalSpend: item.googleSpend + item.amazonSpend
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const combinedTrendData = combinedTimeSeries()

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading advertising data...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ErrorBoundary componentName="CombinedAdvertisingDashboard">
      <div className="space-y-6">
        <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full max-w-[500px] grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="amazon">Amazon Ads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Combined Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Ad Spend</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(combinedMetrics.totalSpend)}</div>
                <p className="text-xs text-muted-foreground">
                  Google + Amazon combined
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
                <MousePointer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(combinedMetrics.totalClicks)}</div>
                <p className="text-xs text-muted-foreground">
                  All platforms combined
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Impressions</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(combinedMetrics.totalImpressions)}</div>
                <p className="text-xs text-muted-foreground">
                  Ad views across platforms
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Conversions</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(combinedMetrics.totalConversions)}</div>
                <p className="text-xs text-muted-foreground">
                  Combined conversions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg CPC</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(combinedMetrics.totalClicks > 0 ? combinedMetrics.totalSpend / combinedMetrics.totalClicks : 0, 2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined cost per click
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Conv. Rate</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPercent(combinedMetrics.totalClicks > 0 ? (combinedMetrics.totalConversions * 100) / combinedMetrics.totalClicks : 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined conversion rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cost/Conv.</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(combinedMetrics.totalConversions > 0 ? combinedMetrics.totalSpend / combinedMetrics.totalConversions : 0, 2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined cost per conversion
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ROAS</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(combinedMetrics.totalSpend > 0 ? combinedMetrics.totalConversionsValue / combinedMetrics.totalSpend : 0).toFixed(2)}x
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined return on ad spend
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Platform Comparison Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Spend Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Ad Spend by Platform</CardTitle>
                <CardDescription>Distribution of advertising budget across platforms</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={platformComparison}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => {
                        if (!entry || !combinedMetrics.totalSpend) return '0%'
                        return `${((entry.spend / combinedMetrics.totalSpend) * 100).toFixed(1)}%`
                      }}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="spend"
                    >
                      {platformComparison.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {platformComparison.map((platform) => (
                    <div key={platform.platform} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: platform.color }}
                        />
                        <span>{platform.platform}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{formatCurrency(platform.spend)}</span>
                        <span>{formatNumber(platform.clicks)} clicks</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Platform Performance Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>Platform Performance Metrics</CardTitle>
                <CardDescription>Key metrics comparison between platforms</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={platformComparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="platform" />
                    <YAxis tickFormatter={formatCurrency} />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Bar dataKey="spend" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Combined Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Ad Spend Trend</CardTitle>
              <CardDescription>Daily advertising spend across both platforms</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={combinedTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => {
                      if (!date) return ''
                      try {
                        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      } catch (e) {
                        return ''
                      }
                    }}
                  />
                  <YAxis tickFormatter={formatCurrencyAxis} />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value)}
                    labelFormatter={(date) => {
                      if (!date) return ''
                      try {
                        return new Date(date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      } catch (e) {
                        return ''
                      }
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="googleSpend"
                    stroke="#4285F4"
                    strokeWidth={2}
                    name="Google Ads"
                  />
                  <Line
                    type="monotone"
                    dataKey="amazonSpend"
                    stroke="#FF9900"
                    strokeWidth={2}
                    name="Amazon Ads"
                  />
                  <Line
                    type="monotone"
                    dataKey="totalSpend"
                    stroke="#7C3AED"
                    strokeWidth={3}
                    name="Total Spend"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google" className="space-y-4">
          <AdvertisingDashboard dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="amazon" className="space-y-4">
          <AmazonAdsReport dateRange={dateRange} />
        </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
}