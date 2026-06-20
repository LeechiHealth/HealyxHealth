import React from "react"
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ClientLayout } from '@/components/ClientLayout'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geistSans = Geist({ 
  subsets: ["latin"],
  variable: '--font-sans'
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: '--font-mono'
});

export const metadata = {
  title: 'Healyx Health',
  description: 'Your personal health operating system',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent' as const,
    title: 'Healyx',
  },
  icons: {
    icon: [
      { url: '/healyx-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/healyx-mark-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: [{ url: '/healyx-apple-180.png', sizes: '180x180' }],
  },
}

export const viewport = {
  themeColor: '#0A1020',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
       <ClientLayout>
          {children}
        </ClientLayout>
        <Toaster position="bottom-right" richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}
