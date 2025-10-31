"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { DateRange } from "react-day-picker"
import { TrendingUp, TrendingDown, DollarSign, MousePointer, Eye, Target, Zap, Package } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ErrorBoundary } from "@/components/error-boundary"
import { validateChartData, safeNumber } from "@/lib/data-validation"

interface AmazonAdsReportProps {
  dateRange?: DateRange
}

export function AmazonAdsReport({ dateRange }: AmazonAdsReportProps) {
  const [data, setData] = useState<any>({
    summary: {},
    metrics: [],
    topKeywords: [],
    portfolios: [],
    matchTypePerformance: []
  })
  const [masterAdsData, setMasterAdsData] = useState<any>({
    summary: {},
    daily: [],
    channels: []
  })
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<string>('campaign')

  useEffect(() => {
    fetchData()
  }, [dateRange, groupBy])

  const fetchData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    params.append("groupBy", groupBy)
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      const [adsResponse, masterResponse] = await Promise.all([
        fetch(`/api/amazon/ads-report?${params}`),
        fetch(`/api/ads/master-metrics?${params.toString().replace('groupBy=' + groupBy + '&', '')}`)
      ])
      const [adsResult, masterResult] = await Promise.all([
        adsResponse.json(),
        masterResponse.json()
      ])
      setData(adsResult)
      setMasterAdsData(masterResult)
    } catch (error) {
      console.error("Error fetching Amazon ads report:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value))
  }

  const formatPercent = (value: number) => {
    return `${value?.toFixed(2) || 0}%`
  }

  const getPortfolioColor = (index: number) => {
    const colors = ['#4ECDC4', '#FF6B6B', '#95E1D3', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
    return colors[index % colors.length]
  }

  // Safely get arrays with fallbacks
  const safePortfolios = Array.isArray(data.portfolios) ? data.portfolios : []
  const safeMatchTypes = Array.isArray(data.matchTypePerformance) ? data.matchTypePerformance : []
  const safeMetrics = Array.isArray(data.metrics) ? data.metrics : []
  const safeKeywords = Array.isArray(data.topKeywords) ? data.topKeywords : []

  // Validate chart data
  const portfoliosValidation = validateChartData(safePortfolios)
  const matchTypesValidation = validateChartData(safeMatchTypes)
  const metricsValidation = validateChartData(safeMetrics)

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading Amazon ads report...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ErrorBoundary componentName="AmazonAdsReport">
      <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.summary?.total_cost || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary?.total_campaigns || 0} campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_clicks || 0)}</div>
            <p className="text-xs text-muted-foreground">
              CPC: {formatCurrency(data.summary?.overall_cpc || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_impressions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Conv. Rate: {formatPercent(data.summary?.overall_conversion_rate || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary?.active_campaigns || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {data.summary?.total_campaigns || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Keywords</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.summary?.total_keywords || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {data.summary?.total_ad_groups || 0} ad groups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolios</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary?.total_portfolios || 0}</div>
            <p className="text-xs text-muted-foreground">
              Product groups
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
              {formatCurrency((data.summary?.total_conversions || 0) > 0 ? (data.summary?.total_cost || 0) / data.summary.total_conversions : 0, 2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cost per conversion
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
              {((data.summary?.total_cost || 0) > 0 ? (data.summary?.total_conversions_value || 0) / data.summary.total_cost : 0).toFixed(2)}x
            </div>
            <p className="text-xs text-muted-foreground">
              Return on ad spend
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overview Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Portfolio Performance Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Spend by Portfolio</CardTitle>
            <CardDescription>Distribution of ad spend across product portfolios</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={portfoliosValidation.data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => {
                    const totalCost = safeNumber(data.summary?.total_cost)
                    if (!entry || totalCost === 0) return ''
                    return `${((safeNumber(entry.cost) / totalCost) * 100).toFixed(1)}%`
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {portfoliosValidation.data.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={getPortfolioColor(index)} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {safePortfolios.slice(0, 5).map((portfolio: any, index: number) => (
                <div key={portfolio.portfolio} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getPortfolioColor(index) }}
                    />
                    <span className="truncate max-w-[200px]">{portfolio.portfolio}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{formatCurrency(portfolio.cost)}</span>
                    <span>Conv. Rate: {formatPercent(portfolio.conversion_rate || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Match Type Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Match Type Performance</CardTitle>
            <CardDescription>Effectiveness of different keyword match types</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={matchTypesValidation.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="match_type" angle={-45} textAnchor="end" height={80} />
                <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                <Tooltip formatter={(value: any, name: string) => {
                  if (name === 'cost') return formatCurrency(value)
                  if (name === 'ctr') return formatPercent(value)
                  return formatNumber(value)
                }} />
                <Legend />
                <Bar yAxisId="left" dataKey="cost" fill="#8884d8" name="Cost" />
                <Bar yAxisId="right" dataKey="conversion_rate" fill="#82ca9d" name="Conv. Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cost Efficiency Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Efficiency Analysis</CardTitle>
          <CardDescription>CPC vs CTR for top spending items</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={metricsValidation.data.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="group_name" 
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 11 }}
              />
              <YAxis yAxisId="left" orientation="left" stroke="#FF6B6B" />
              <YAxis yAxisId="right" orientation="right" stroke="#4ECDC4" />
              <Tooltip formatter={(value: any, name: string) => {
                if (name.includes('CPC')) return formatCurrency(value)
                if (name.includes('Conv. Rate')) return formatPercent(value)
                return value
              }} />
              <Legend />
              <Bar yAxisId="left" dataKey="avg_cpc" fill="#FF6B6B" name="Avg CPC ($)" />
              <Bar yAxisId="right" dataKey="conversion_rate" fill="#4ECDC4" name="Conv. Rate (%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Campaign Performance Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>Detailed metrics for all campaigns</CardDescription>
            </div>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campaign">By Campaign</SelectItem>
                <SelectItem value="adgroup">By Ad Group</SelectItem>
                <SelectItem value="portfolio">By Portfolio</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {groupBy === 'campaign' && <TableHead>Portfolio</TableHead>}
                {groupBy === 'campaign' && <TableHead>Status</TableHead>}
                {groupBy === 'adgroup' && <TableHead>Campaign</TableHead>}
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                {groupBy === 'campaign' && <TableHead className="text-right">Ad Groups</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeMetrics.slice(0, 20).map((item: any, index: number) => (
                <TableRow key={index}>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {item.group_name}
                  </TableCell>
                  {groupBy === 'campaign' && (
                    <TableCell>
                      <Badge variant="outline">{item.portfolio_name || 'No Portfolio'}</Badge>
                    </TableCell>
                  )}
                  {groupBy === 'campaign' && (
                    <TableCell>
                      <Badge variant={item.campaign_status === 'ENABLED' ? 'default' : 'secondary'}>
                        {item.campaign_status}
                      </Badge>
                    </TableCell>
                  )}
                  {groupBy === 'adgroup' && (
                    <TableCell className="max-w-[200px] truncate">
                      {item.campaign_name}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.total_cost)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(item.total_clicks)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(item.total_impressions)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(item.conversion_rate || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.avg_cpc)}
                  </TableCell>
                  {groupBy === 'campaign' && (
                    <TableCell className="text-right">
                      {item.ad_groups_count}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Top Keywords Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Keywords</CardTitle>
          <CardDescription>Keywords driving the most clicks and conversions</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Search Term</TableHead>
                <TableHead>Match Type</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeKeywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-muted-foreground">No keyword data available for this date range</p>
                      <p className="text-sm text-muted-foreground">
                        Try selecting a date range between August 6 - September 3, 2025
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                safeKeywords.map((keyword: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {keyword.keyword || 'N/A'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {keyword.search_term || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{keyword.match_type || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {keyword.campaign}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(keyword.clicks)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(keyword.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(keyword.cpc)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={(keyword.conversion_rate || 0) > 5 ? 'text-green-600 font-medium' : ''}>
                        {formatPercent(keyword.conversion_rate || 0)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Portfolio Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance</CardTitle>
          <CardDescription>Performance breakdown by product portfolio</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Portfolio</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead className="text-right">Ad Groups</TableHead>
                <TableHead className="text-right">Keywords</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Conv. Rate</TableHead>
                <TableHead className="text-right">Avg CPC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safePortfolios.map((portfolio: any, index: number) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: getPortfolioColor(index) }}
                      />
                      {portfolio.portfolio}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {portfolio.campaigns}
                  </TableCell>
                  <TableCell className="text-right">
                    {portfolio.ad_groups}
                  </TableCell>
                  <TableCell className="text-right">
                    {portfolio.keywords}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(portfolio.cost)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(portfolio.clicks)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={(portfolio.conversion_rate || 0) > 5 ? 'text-green-600 font-medium' : ''}>
                      {formatPercent(portfolio.conversion_rate || 0)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(portfolio.avg_cpc)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </ErrorBoundary>
  )
}