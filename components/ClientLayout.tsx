"use client"

import { AuthProvider } from '@/components/AuthContext'
import { ThemeProvider } from '@/components/theme-provider'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  )
}