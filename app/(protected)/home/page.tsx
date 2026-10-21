"use client"

import { HomeHero } from "@/components/home/home-hero"
import { HealthSnapshot } from "@/components/home/health-snapshot"
import { WellbeingCheckin } from "@/components/home/wellbeing-checkin"
import { Timeline } from "@/components/home/timeline"
import { Header } from "@/components/header"
import { useAuth } from "@/components/AuthContext"
import Link from "next/link"
import { ArrowUpRight, FileHeart, BookOpen, ListChecks } from "lucide-react"

export default function HomePage() {
  const { user } = useAuth()
  const name = (user?.user_metadata?.first_name || user?.user_metadata?.full_name || "").split(" ")[0]
  return (
    <div className="min-h-screen dashboard-shell">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-9 sm:pt-12 pb-24 space-y-7 dashboard-enter">
        <div className="flex items-end justify-between gap-5">
          <div><p className="eyebrow text-primary">Your personal health workspace</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">A clearer picture of you{name ? `, ${name}` : ""}.</h1><p className="text-sm text-muted-foreground mt-3 max-w-xl">Understand your signals. Find grounded answers. Know what to do next.</p></div>
          <span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pb-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Your overview</span>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)] gap-6 items-start">
          <div className="space-y-6"><HealthSnapshot /><Timeline limit={4} /></div>
          <aside className="space-y-5 lg:sticky lg:top-6"><div id="health-chat" className="health-panel overflow-hidden"><HomeHero /></div>
            <div className="health-panel p-5"><p className="eyebrow mb-3">Make your next move</p>{[{ href: "/data", icon: FileHeart, title: "Build your health record", text: "Labs, vitals, and visit notes in one place." }, { href: "/insights", icon: BookOpen, title: "Follow the evidence", text: "Explore research behind your questions." }, { href: "/protocol", icon: ListChecks, title: "Turn information into action", text: "Review the factors behind your plan." }].map(a => <Link key={a.href} href={a.href} className="flex items-center gap-3 py-3.5 border-b border-border last:border-0 group"><a.icon className="h-5 w-5 text-primary shrink-0" /><div className="flex-1"><p className="text-sm font-semibold group-hover:text-primary transition-colors">{a.title}</p><p className="text-xs text-muted-foreground mt-1">{a.text}</p></div><ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" /></Link>)}</div>
            <WellbeingCheckin />
          </aside>
        </div>
      </main>
    </div>
  )
}
