"use client"

import { useState, Suspense } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import { DateRangePicker } from "@/components/dashboard/date-range-picker"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { DashboardProvider, useDashboard } from "./dashboard-context"

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { dateRange, selectedChannel, setDateRange, setSelectedChannel } = useDashboard()

  // Map pathname to currentView for sidebar
  const getCurrentView = () => {
    const path = pathname.split('/').pop() || 'overview'
    return path
  }

  const handleViewChange = (view: string) => {
    // Preserve current date range and channel when navigating
    const params = new URLSearchParams()
    if (dateRange?.from) {
      params.append('startDate', dateRange.from.toISOString().split('T')[0])
    }
    if (dateRange?.to) {
      params.append('endDate', dateRange.to.toISOString().split('T')[0])
    }
    if (selectedChannel !== 'all') {
      params.append('channel', selectedChannel)
    }
    
    const url = params.toString() ? `/dashboard/${view}?${params.toString()}` : `/dashboard/${view}`
    router.push(url)
  }

  // Get page title based on current path
  const getPageTitle = () => {
    const titles: { [key: string]: string } = {
      overview: "Sales Dashboard - Overview",
      "site-amazon": "Amazon Store",
      "site-woocommerce": "WooCommerce Store", 
      products: "Product Performance",
      categories: "Category Analysis",
      breakdown: "Product Breakdown",
      comparison: "Product Comparison",
      advertising: "Advertising Dashboard",
      traffic: "Traffic Analytics",
      "search-console": "Search Console Analytics",
      analytics: "Analytics & Metrics"
    }
    const currentPath = pathname.split('/').pop() || 'overview'
    return titles[currentPath] || "Sales Dashboard"
  }

  return (
    <div className="flex min-h-screen">
      <SidebarNav 
        currentView={getCurrentView()} 
        onViewChange={handleViewChange}
        onCollapsedChange={setSidebarCollapsed}
      />
      
      <main className={cn(
        "flex-1 transition-all duration-300",
        sidebarCollapsed ? "md:ml-16" : "md:ml-64"
      )}>
        <div className="p-8 pt-6">
          {/* Header */}
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-6">
            <h2 className="text-3xl font-bold tracking-tight ml-12 md:ml-0">
              {getPageTitle()}
            </h2>
            <div className="flex items-center space-x-2">
              <DateRangePicker date={dateRange} onDateChange={setDateRange} />
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="Amazon">Amazon</SelectItem>
                  <SelectItem value="WooCommerce">WooCommerce</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  router.push('/login')
                }}
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <DashboardProvider>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </DashboardProvider>
    </Suspense>
  )
}