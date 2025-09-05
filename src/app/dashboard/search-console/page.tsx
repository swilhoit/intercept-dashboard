"use client"

import { SearchConsoleAnalytics } from "@/components/dashboard/search-console-analytics"
import { useDashboard } from "../dashboard-context"

export default function SearchConsolePage() {
  const { dateRange } = useDashboard()

  return <SearchConsoleAnalytics dateRange={dateRange} />
}