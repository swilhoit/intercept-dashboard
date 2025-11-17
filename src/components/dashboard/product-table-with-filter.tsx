"use client"

import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRange } from "react-day-picker"
import { useCachedFetch } from "@/hooks/use-cached-fetch"
import { Package } from "lucide-react"

interface ProductTableWithFilterProps {
  dateRange?: DateRange
  title?: string
  description?: string
  hideChannelFilter?: boolean // Option to hide the channel filter when global filter is used
  channel?: string // External channel control (from dashboard context)
}

export function ProductTableWithFilter({
  dateRange,
  title = "Top Performing Products",
  description = "Products ranked by total revenue",
  hideChannelFilter = false,
  channel: externalChannel
}: ProductTableWithFilterProps) {
  const [localChannel, setLocalChannel] = useState<string>("all")
  
  // Use external channel if provided (when hideChannelFilter is true), otherwise use local state
  const channel = hideChannelFilter && externalChannel ? externalChannel : localChannel

  // Build API URL with parameters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    if (channel !== "all") {
      params.append("channel", channel)
    }
    return `/api/sales/products?${params.toString()}`
  }, [dateRange, channel])

  const { data, loading } = useCachedFetch<any[]>(apiUrl, { ttl: 120000 })
  const allProducts = data || []
  const products = allProducts.slice(0, 20)
  const hasMore = allProducts.length > 20

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0)
  }

  const getChannelColor = (channel: string) => {
    return channel === 'Amazon' ? 'bg-orange-500' : 'bg-blue-500'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {description}
              {!loading && (
                <span className="ml-2 text-xs">
                  • Showing {products.length} of {allProducts.length} products
                  {hasMore && " (top 20)"}
                </span>
              )}
            </CardDescription>
          </div>
          {!hideChannelFilter && (
            <Select value={localChannel} onValueChange={setLocalChannel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="Amazon">Amazon</SelectItem>
                <SelectItem value="WooCommerce">WooCommerce</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
              <p>Loading products...</p>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No products found</p>
              <p className="text-xs mt-1">Try adjusting your date range or channel filter</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, index) => (
                <TableRow key={index}>
                  <TableCell 
                    className="font-medium max-w-[300px] truncate cursor-help" 
                    title={product.product_name}
                  >
                    {product.product_name}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getChannelColor(product.channel)} text-white`} variant="secondary">
                      {product.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{product.quantity}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(product.total_sales)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}