"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to dashboard/overview
    router.push('/dashboard/overview')
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Redirecting to Dashboard...</h1>
        <p className="text-muted-foreground">Please wait while we load your dashboard.</p>
      </div>
    </div>
  )
}