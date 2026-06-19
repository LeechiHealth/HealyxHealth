"use client"

import type { ReactNode } from "react"
import { useAuth } from "@/components/AuthContext"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect once auth check is complete — prevents race condition
    // where child components render before redirect fires
    if (!loading && !user) {
      router.replace("/signin")
    }
  }, [user, loading, router])

  // Show full-screen spinner while auth state resolves
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  // Hard gate — render nothing while redirect is in flight
  if (!user) return null

  return <>{children}</>
}
