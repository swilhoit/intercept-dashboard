'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PackageX, TrendingDown, AlertTriangle } from "lucide-react"
import { formatCurrency, formatNumber } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"

interface ReturnsImpactCardProps {
  totalRevenue: number
  totalRefunds: number
  totalReturns: number
  affectedOrders?: number
  loading?: boolean
}

export function ReturnsImpactCard({
  totalRevenue,
  totalRefunds,
  totalReturns,
  affectedOrders,
  loading
}: ReturnsImpactCardProps) {
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const netRevenue = totalRevenue - totalRefunds
  const returnImpactPercent = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0
  const needsAttention = returnImpactPercent > 10 // Alert if returns > 10% of revenue

  return (
    <Card className={needsAttention ? "border-orange-300" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PackageX className="h-4 w-4" />
            Returns Impact
          </CardTitle>
          <CardDescription className="text-xs mt-1">
            Amazon returns affecting revenue
          </CardDescription>
        </div>
        {needsAttention && (
          <AlertTriangle className="h-5 w-5 text-orange-500" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Net Revenue */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-muted-foreground">Net Revenue</span>
            <span className="text-sm text-muted-foreground">
              {formatCurrency(totalRevenue)} - {formatCurrency(totalRefunds)}
            </span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(netRevenue)}
          </div>
        </div>

        {/* Returns Breakdown */}
        <div className="space-y-3 pt-2 border-t">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Total Refunds</span>
            </div>
            <span className="text-sm font-semibold text-red-600">
              {formatCurrency(totalRefunds)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Return Count</span>
            <span className="font-medium">{formatNumber(totalReturns)}</span>
          </div>

          {affectedOrders !== undefined && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Affected Orders</span>
              <span className="font-medium">{formatNumber(affectedOrders)}</span>
            </div>
          )}

          {/* Return Impact Percentage */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Revenue Impact</span>
              <span className={`font-semibold ${needsAttention ? 'text-orange-600' : 'text-gray-700'}`}>
                {returnImpactPercent.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={Math.min(returnImpactPercent, 100)} 
              className="h-2"
              indicatorClassName={needsAttention ? "bg-orange-500" : "bg-red-500"}
            />
            {needsAttention && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                High return rate - investigate products
              </p>
            )}
          </div>
        </div>

        {/* View Details Link */}
        <Link 
          href="/dashboard/amazon-returns"
          className="block w-full text-center text-xs text-blue-600 hover:text-blue-800 hover:underline pt-2 border-t"
        >
          View detailed returns analysis →
        </Link>
      </CardContent>
    </Card>
  )
}

