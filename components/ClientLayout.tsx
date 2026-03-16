"use client"

import { AuthProvider } from '@/components/AuthContext'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}