"use client"

import { ProductTableWithFilter } from "@/components/dashboard/product-table-with-filter"
import { useDashboard } from "../dashboard-context"

export default function ProductsPage() {
  const { dateRange } = useDashboard()

  return <ProductTableWithFilter dateRange={dateRange} />
}