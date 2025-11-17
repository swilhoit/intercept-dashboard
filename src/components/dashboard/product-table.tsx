"use client"

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
import { Package } from "lucide-react"

interface ProductTableProps {
  products: Array<{
    product_name: string
    channel: string
    total_sales: number
    quantity: number
  }>
  title?: string
  description?: string
}

export function ProductTable({ products, title = "Top Products", description = "Best performing products by revenue" }: ProductTableProps) {
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
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description}
          {products.length > 0 && (
            <span className="ml-2 text-xs">• Showing {products.length} products</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No products found</p>
              <p className="text-xs mt-1">No sales data available for this period</p>
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