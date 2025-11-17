"use client"

import { useState, useEffect, useCallback } from "react"
import { IndividualSiteDashboard } from "@/components/dashboard/individual-site-dashboard"
import { useDashboard } from "../dashboard-context"

export default function SiteHeatilatorPage() {
  const [siteData, setSiteData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { dateRange } = useDashboard()

  const fetchSiteData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }
    params.append("site", "heatilator")

    try {
      const [dailySalesRes, productsRes, categoriesRes] = await Promise.all([
        fetch(`/api/woocommerce/site-sales?${params}`),
        fetch(`/api/woocommerce/site-products?${params}`),
        fetch(`/api/sales/category-products?${params}`)
      ])

      const [dailySales, products, categoriesData] = await Promise.all([
        dailySalesRes.ok ? dailySalesRes.json().catch(() => []) : [],
        productsRes.ok ? productsRes.json().catch(() => []) : [],
        categoriesRes.ok ? categoriesRes.json().catch(() => ({ products: [] })) : { products: [] }
      ])

      const validDailySales = Array.isArray(dailySales) ? dailySales : []
      const validProducts = Array.isArray(products) ? products : []
      const validCategoriesData = categoriesData?.products || []

      // Filter and group categories for this site
      const categoriesGrouped = validCategoriesData
        .filter((product: any) => product.channel === 'WooCommerce')
        .reduce((acc: any, product: any) => {
          const category = product.category || 'Other'
          if (!acc[category]) {
            acc[category] = { name: category, revenue: 0, quantity: 0 }
          }
          acc[category].revenue += product.total_sales || 0
          acc[category].quantity += product.quantity || 0
          return acc
        }, {})

      const categoryArray = Object.values(categoriesGrouped)

      const transformedData = {
        summary: {
          total_revenue: validDailySales.reduce((sum: number, day: any) => sum + (day.total_sales || 0), 0),
          total_units: validDailySales.reduce((sum: number, day: any) => sum + (day.order_count || 0), 0),
          avg_order_value: (() => {
            const totalRevenue = validDailySales.reduce((sum: number, day: any) => sum + (day.total_sales || 0), 0)
            const totalUnits = validDailySales.reduce((sum: number, day: any) => sum + (day.order_count || 0), 0)
            return totalUnits > 0 ? totalRevenue / totalUnits : 0
          })()
        },
        daily: validDailySales
          .map((day: any) => ({
            date: day.date?.value || day.date,
            sales: day.total_sales || 0
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      }

      setSiteData({
        salesData: transformedData,
        productData: validProducts,
        categoryData: categoryArray
      })
    } catch (error) {
      console.error("Error fetching Heatilator site data:", error)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchSiteData()
  }, [fetchSiteData])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <IndividualSiteDashboard
      siteName="Heatilator"
      siteColor="#3498db"
      salesData={siteData?.salesData}
      productData={siteData?.productData || []}
      
    />
  )
}
