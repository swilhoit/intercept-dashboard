"use client"

import { useState, useEffect } from "react"
import { AmazonDashboard } from "@/components/dashboard/site-amazon"
import { useDashboard } from "../dashboard-context"

export default function SiteAmazonPage() {
  const [siteData, setSiteData] = useState<any>(null)
  const [trafficData, setTrafficData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { dateRange } = useDashboard()

  useEffect(() => {
    fetchSiteData()
  }, [dateRange])

  const fetchSiteData = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append("startDate", dateRange.from.toISOString().split("T")[0])
    }
    if (dateRange?.to) {
      params.append("endDate", dateRange.to.toISOString().split("T")[0])
    }

    try {
      // Fetch data from Amazon APIs
      const [dailySalesRes, productsRes, trafficRes, categoriesRes] = await Promise.all([
        fetch(`/api/amazon/daily-sales?${params}`),
        fetch(`/api/amazon/products?${params}`),
        fetch(`/api/analytics/traffic?${params}`),
        fetch(`/api/sales/category-products?${params}`)
      ])

      // Handle failed API responses gracefully
      const [dailySales, products, trafficInfo, categoriesData] = await Promise.all([
        dailySalesRes.ok ? dailySalesRes.json().catch(() => []) : [],
        productsRes.ok ? productsRes.json().catch(() => []) : [],
        trafficRes.ok ? trafficRes.json().catch(() => ({})) : {},
        categoriesRes.ok ? categoriesRes.json().catch(() => ({ products: [] })) : { products: [] }
      ])

      // Ensure data arrays are valid before processing
      const validDailySales = Array.isArray(dailySales) ? dailySales : []
      const validProducts = Array.isArray(products) ? products : []
      const validCategoriesData = categoriesData?.products || []

      // Process category data - filter for Amazon only and group by category
      const amazonCategoriesGrouped = validCategoriesData
        .filter((product: any) => product.channel === 'Amazon')
        .reduce((acc: any, product: any) => {
          const category = product.category || 'Other'
          if (!acc[category]) {
            acc[category] = { name: category, revenue: 0, quantity: 0, channel: 'Amazon' }
          }
          acc[category].revenue += product.total_sales || 0
          acc[category].quantity += product.quantity || 0
          return acc
        }, {})

      const categoryArray = Object.values(amazonCategoriesGrouped)

      // Transform data to match expected format
      const amazonSiteData = {
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
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        monthly: Object.values(
          validDailySales.reduce((acc: any, day: any) => {
            const date = new Date(day.date?.value || day.date)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })

            if (!acc[monthKey]) {
              acc[monthKey] = { date: monthName, sales: 0 }
            }
            acc[monthKey].sales += day.total_sales || 0
            return acc
          }, {})
        ).sort((a: any, b: any) => new Date(a.date + ' 1').getTime() - new Date(b.date + ' 1').getTime()),
        products: validProducts.map((product: any) => ({
          product_name: product.product_name,
          total_sales: product.total_sales,
          quantity: product.order_count,
          channel: 'Amazon'
        })),
        categories: categoryArray
      }

      setSiteData(amazonSiteData)
      setTrafficData(trafficInfo)
    } catch (error) {
      console.error("Error fetching Amazon site data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <AmazonDashboard
      salesData={siteData}
      productData={siteData?.products || []}
      categoryData={siteData?.categories || []}
      trafficData={trafficData}
      startDate={dateRange?.from?.toISOString().split("T")[0] || ''}
      endDate={dateRange?.to?.toISOString().split("T")[0] || ''}
    />
  )
}