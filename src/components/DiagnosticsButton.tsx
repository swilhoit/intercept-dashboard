"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity } from "lucide-react"

export function DiagnosticsButton() {
  const pathname = usePathname()

  // Don't show on the diagnostics page itself
  if (pathname === '/admin/diagnostics') {
    return null
  }

  return (
    <Link
      href="/admin/diagnostics"
      className="fixed bottom-6 left-6 z-50 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
      title="System Diagnostics"
    >
      <Activity className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
    </Link>
  )
}
