"use client"

import { useState, useEffect } from "react"
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRange } from "react-day-picker"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package } from "lucide-react"

interface CategoryAnalysisProps {
  dateRange?: DateRange
}

export function CategoryAnalysis({ dateRange }: CategoryAnalysisProps) {
  const [aggregation, setAggregation] = useState<string>("daily")
  const [data, setData] = useState<any>({ categories: {}, aggregated: [], dates: [] })
  const [products, setProducts] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchData()
  }, [dateRange, aggregation])

  const fetchData = async () => {
    setLoading(true)
    
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    params.append("aggregation", aggregation)

    try {
      const [categoryResponse, productsResponse] = await Promise.all([
        fetch(`/api/sales/categories?${params}`),
        fetch(`/api/sales/category-products?${params}`)
      ])
      const categoryData = await categoryResponse.json()
      const productsData = await productsResponse.json()
      setData(categoryData)
      setProducts(productsData.products || [])
    } catch (error) {
      console.error("Error fetching category data:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    if (dateStr && dateStr.includes('W')) {
      const [year, week] = dateStr.split('-W')
      return `Week ${week}`
    } else if (dateStr && dateStr.match(/^\d{4}-\d{2}$/)) {
      const [year, month] = dateStr.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Fireplace Doors': '#FF6B6B',
      'Paint': '#4ECDC4',
      'Other': '#95A5A6'
    }
    return colors[category] || '#95A5A6'
  }

  const toggleCategory = (categoryName: string) => {
    const newHidden = new Set(hiddenCategories)
    if (newHidden.has(categoryName)) {
      newHidden.delete(categoryName)
    } else {
      newHidden.add(categoryName)
    }
    setHiddenCategories(newHidden)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading category analysis...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categories = Object.values(data.categories || {})
  const mainCategories = categories.filter((cat: any) => cat.name !== 'Other')
  const otherCategory = categories.find((cat: any) => cat.name === 'Other') as any

  // Calculate total sales for percentage calculations
  const totalSales = categories.reduce((sum: number, cat: any) => sum + (cat.totalSales || 0), 0)
  
  // Prepare pie chart data
  const pieData = categories.map((cat: any) => ({
    name: cat.name,
    value: cat.totalSales || 0,
    percentage: totalSales > 0 ? ((cat.totalSales || 0) / totalSales * 100).toFixed(1) : '0'
  }))

  // Custom label for pie chart
  const renderCustomLabel = (entry: any) => {
    return `${entry.percentage}%`
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards and Pie Chart */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
          {mainCategories.map((category: any) => (
            <Card key={category.name}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{category.name}</CardTitle>
                <Badge style={{ backgroundColor: getCategoryColor(category.name), color: 'white' }}>
                  {totalSales > 0 ? ((category.totalSales / totalSales) * 100).toFixed(1) : '0'}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(category.totalSales)}</div>
                <p className="text-xs text-muted-foreground mb-2">
                  {category.totalQuantity.toLocaleString()} units • {category.uniqueProducts} products
                </p>
                {category.channelBreakdown && (
                  <div className="space-y-1 border-t pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Amazon:</span>
                      <span className="font-medium text-orange-600">
                        {formatCurrency(category.channelBreakdown.amazon)}
                        {category.totalSales > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({((category.channelBreakdown.amazon / category.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">WooCommerce:</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(category.channelBreakdown.woocommerce)}
                        {category.totalSales > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({((category.channelBreakdown.woocommerce / category.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {otherCategory && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Other Products</CardTitle>
                <Badge variant="secondary">
                  {totalSales > 0 ? ((otherCategory.totalSales / totalSales) * 100).toFixed(1) : '0'}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(otherCategory.totalSales)}</div>
                <p className="text-xs text-muted-foreground mb-2">
                  {otherCategory.totalQuantity.toLocaleString()} units • {otherCategory.uniqueProducts} products
                </p>
                {otherCategory.channelBreakdown && (
                  <div className="space-y-1 border-t pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Amazon:</span>
                      <span className="font-medium text-orange-600">
                        {formatCurrency(otherCategory.channelBreakdown.amazon)}
                        {otherCategory.totalSales > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({((otherCategory.channelBreakdown.amazon / otherCategory.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">WooCommerce:</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(otherCategory.channelBreakdown.woocommerce)}
                        {otherCategory.totalSales > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({((otherCategory.channelBreakdown.woocommerce / otherCategory.totalSales) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pie Chart */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Category Distribution</CardTitle>
            <CardDescription className="text-xs">% of total sales</CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getCategoryColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(entry.name) }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                  <span className="font-medium">{entry.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aggregated Total Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Total Sales by Category</CardTitle>
              <CardDescription>Aggregated sales across all product categories (click legend to toggle)</CardDescription>
            </div>
            <Select value={aggregation} onValueChange={setAggregation}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={(data.aggregated || []).map((item: any) => ({
              ...item,
              date: formatDate(item.date)
            }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                angle={aggregation === "daily" && (data.aggregated?.length || 0) > 20 ? -45 : 0}
                textAnchor={aggregation === "daily" && (data.aggregated?.length || 0) > 20 ? "end" : "middle"}
                height={aggregation === "daily" && (data.aggregated?.length || 0) > 20 ? 80 : 40}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                tickFormatter={formatCurrency}
              />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend 
                onClick={(e: any) => {
                  if (e && e.value) {
                    toggleCategory(e.value)
                  }
                }}
                wrapperStyle={{ cursor: 'pointer' }}
              />
              {mainCategories.map((category: any) => (
                !hiddenCategories.has(category.name) && (
                  <Line 
                    key={category.name}
                    type="monotone" 
                    dataKey={category.name}
                    stroke={getCategoryColor(category.name)}
                    strokeWidth={2}
                    dot={aggregation !== "daily" || (data.aggregated?.length || 0) <= 30}
                    hide={hiddenCategories.has(category.name)}
                  />
                )
              ))}
              {otherCategory && !hiddenCategories.has('Other') && (
                <Line 
                  type="monotone" 
                  dataKey="Other"
                  stroke={getCategoryColor('Other')}
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  hide={hiddenCategories.has('Other')}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Channel Breakdown by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Distribution by Category</CardTitle>
          <CardDescription>Sales breakdown between Amazon and WooCommerce for each category</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart 
              data={categories.map((cat: any) => ({
                name: cat.name,
                Amazon: cat.channelBreakdown?.amazon || 0,
                WooCommerce: cat.channelBreakdown?.woocommerce || 0
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis tickFormatter={formatCurrency} className="text-xs" />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Bar dataKey="Amazon" fill="#FF9500" />
              <Bar dataKey="WooCommerce" fill="#007AFF" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Product Breakdown by Category */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product Breakdown by Category</CardTitle>
              <CardDescription>Top products in each category</CardDescription>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Fireplace Doors">Fireplace Doors</SelectItem>
                <SelectItem value="Paint">Paint</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products
                .filter((product: any) => selectedCategory === "all" || product.category === selectedCategory)
                .slice(0, 20)
                .map((product: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-2 max-w-[300px]">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{product.product_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        style={{ 
                          borderColor: getCategoryColor(product.category),
                          color: getCategoryColor(product.category)
                        }}
                      >
                        {product.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${product.channel === 'Amazon' ? 'bg-orange-500' : 'bg-blue-500'} text-white`}>
                        {product.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(product.total_sales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.quantity?.toLocaleString() || 0}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Individual Category Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {mainCategories.map((category: any) => (
          <Card key={category.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{category.name} Channel Performance</span>
                <Badge style={{ backgroundColor: getCategoryColor(category.name), color: 'white' }}>
                  {category.name}
                </Badge>
              </CardTitle>
              <CardDescription>
                Channel sales trends for {category.name.toLowerCase()} products
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={category.data.map((item: any) => ({
                  ...item,
                  date: formatDate(item.date)
                }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    angle={aggregation === "daily" && category.data.length > 15 ? -45 : 0}
                    textAnchor={aggregation === "daily" && category.data.length > 15 ? "end" : "middle"}
                    height={aggregation === "daily" && category.data.length > 15 ? 60 : 30}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip 
                    formatter={(value: any, name: string) => [
                      formatCurrency(value),
                      name
                    ]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="amazon_sales"
                    name="Amazon"
                    stroke="#FF9500"
                    strokeWidth={2}
                    dot={aggregation !== "daily" || category.data.length <= 20}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="woocommerce_sales"
                    name="WooCommerce"
                    stroke="#007AFF"
                    strokeWidth={2}
                    dot={aggregation !== "daily" || category.data.length <= 20}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}