"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell } from "recharts"
import { DateRange } from "react-day-picker"
import { DollarSign, MousePointer, Eye, Target, TrendingUp, Zap } from "lucide-react"
import { AdvertisingDashboard } from "./advertising-dashboard"
import { AmazonAdsReport } from "./amazon-ads-report"

interface CombinedAdvertisingDashboardProps {
  dateRange?: DateRange
}

export function CombinedAdvertisingDashboard({ dateRange }: CombinedAdvertisingDashboardProps) {
  const [googleData, setGoogleData] = useState<any>({ summary: {}, trend: [], channels: [] })
  const [amazonData, setAmazonData] = useState<any>({ summary: {}, timeSeries: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchCombinedData()
  }, [dateRange])

  const fetchCombinedData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      // Fetch Google Ads data
      const googleResponse = await fetch(`/api/ads/campaigns?${params}`)
      const googleResult = await googleResponse.json()
      setGoogleData(googleResult)

      // Fetch Amazon Ads data
      const amazonParams = new URLSearchParams(params)
      amazonParams.append("timeSeries", "true")
      const amazonResponse = await fetch(`/api/amazon/ads-report?${amazonParams}`)
      const amazonResult = await amazonResponse.json()
      setAmazonData(amazonResult)
    } catch (error) {
      console.error("Error fetching combined advertising data:", error)
    } finally {
      setLoading(false)
    }
  }

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

  // Combined metrics
  const combinedMetrics = {
    totalSpend: (googleData.summary?.totalSpend || 0) + (amazonData.summary?.total_cost || 0),
    totalClicks: (googleData.summary?.totalClicks || 0) + (amazonData.summary?.total_clicks || 0),
    totalImpressions: (googleData.summary?.totalImpressions || 0) + (amazonData.summary?.total_impressions || 0),
    totalConversions: (googleData.summary?.totalConversions || 0) + (amazonData.summary?.total_conversions || 0),
    googleSpend: googleData.summary?.totalSpend || 0,
    amazonSpend: amazonData.summary?.total_cost || 0
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
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, googleSpend: 0, amazonSpend: 0, totalSpend: 0 })
      }
      const dayData = dateMap.get(date)
      dayData.amazonSpend = item.spend || 0
    })
    
    // Calculate totals and return sorted array
    return Array.from(dateMap.values())
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
    <div className="space-y-6">

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full max-w-[500px] grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="amazon">Amazon Ads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Combined Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
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
                <CardTitle className="text-sm font-medium">Overall CTR</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPercent(combinedMetrics.totalImpressions > 0 ? (combinedMetrics.totalClicks * 100) / combinedMetrics.totalImpressions : 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined click-through rate
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
                      label={(entry) => `${((entry.spend / combinedMetrics.totalSpend) * 100).toFixed(1)}%`}
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
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis tickFormatter={formatCurrencyAxis} />
                  <Tooltip 
                    formatter={(value: any) => formatCurrency(value)}
                    labelFormatter={(date) => new Date(date).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
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
  )
}