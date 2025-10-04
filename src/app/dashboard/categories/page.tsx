"use client"

import { CategoryAnalysis } from "@/components/dashboard/category-analysis"
import { useDashboard } from "../dashboard-context"

export default function CategoriesPage() {
  const { dateRange } = useDashboard()

  return <CategoryAnalysis dateRange={dateRange} />
}

