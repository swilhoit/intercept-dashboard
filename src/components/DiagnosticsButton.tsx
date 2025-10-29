"use client"

import Link from "next/link"
import { Activity } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DiagnosticsButton() {
  return (
    <Link href="/admin/diagnostics">
      <Button
        size="lg"
        className="fixed bottom-6 left-6 z-50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-blue-600 hover:bg-blue-700"
        title="System Diagnostics"
      >
        <Activity className="h-5 w-5 mr-2" />
        Diagnostics
      </Button>
    </Link>
  )
}
