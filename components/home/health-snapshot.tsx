"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, ArrowRight, Activity, MessageSquare, BookOpen } from "lucide-react"
import { useBiomarkers } from "@/hooks/useBiomarkers"
import { useAuth } from "@/components/AuthContext"
import { loadHealthScore, type LoadedHealthScore } from "@/lib/clientHealth"
import { buildHealthBrief } from "@/lib/healthBrief"

function ask(question: string) {
  window.dispatchEvent(new CustomEvent("healyx:ask", { detail: { question } }))
  document.getElementById("health-chat")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })
}

export function HealthSnapshot() {
  const { biomarkers, loading, error } = useBiomarkers()
  const { user } = useAuth()
  const [hs, setHs] = React.useState<LoadedHealthScore | null>(null)
  const [scoreLoading, setScoreLoading] = React.useState(true)
  const [scoreError, setScoreError] = React.useState(false)
  React.useEffect(() => {
    let active = true
    setHs(null); setScoreError(false); setScoreLoading(!!user)
    if (user) loadHealthScore(user.id).then(data => { if (active) setHs(data) })
      .catch(() => { if (active) setScoreError(true) })
      .finally(() => { if (active) setScoreLoading(false) })
    return () => { active = false }
  }, [user])
  const brief = React.useMemo(() => buildHealthBrief(biomarkers), [biomarkers])
  const [view, setView] = React.useState<"flagged" | "changes" | "all">("flagged")
  const shown = brief.latest.filter(b => view === "all" || (view === "changes" ? !!b.change : b.classification === "flagged"))
  const counts = [{ label: "Recorded in range", value: brief.inRange, color: "text-primary" }, { label: "Recorded flags", value: brief.flagged, color: "text-amber-600 dark:text-amber-400" }, { label: "Status unknown", value: brief.unknown, color: "text-muted-foreground" }]
  return <section className="space-y-5" aria-label="Your health overview">
    <div className="health-panel overflow-hidden">
      <div className="p-6 sm:p-7 border-b border-border flex items-start justify-between gap-4"><div><p className="eyebrow">Your health, in focus</p><h2 className="text-2xl font-semibold tracking-tight mt-2">Start with what you know.</h2><p className="text-sm text-muted-foreground mt-2">{loading ? "Reading your records…" : error ? "Your records couldn't be loaded. Please refresh to retry." : brief.latest.length ? `${brief.latest.length} markers on file. Latest dated results are shown; unverified dates remain unknown.` : "Connect the dots between your results, questions, and next steps."}</p></div><Activity className="h-5 w-5 text-primary shrink-0 mt-1" /></div>
      <div className="grid grid-cols-3 divide-x divide-border py-6">{counts.map(c => <div key={c.label} className="px-3 sm:px-6"><p className={`text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums ${c.color}`}>{loading ? "…" : error ? "—" : c.value}</p><p className="text-xs sm:text-sm text-muted-foreground mt-2">{c.label}</p></div>)}</div>
      <div className="px-6 py-3 bg-secondary/40 text-xs text-muted-foreground flex flex-wrap justify-between gap-2"><span>Flags describe saved results, not your overall health.</span><Link href="/data?tab=labResults" className="font-semibold text-primary inline-flex items-center gap-1">Open health records <ArrowUpRight className="h-3 w-3" /></Link></div>
    </div>
    {!loading && !error && <div className="health-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><h2 className="font-semibold text-lg">Explore your signals</h2><div className="flex gap-1 rounded-lg bg-secondary p-1" aria-label="Filter health signals">{([['flagged','Flagged'],['changes','Changes'],['all','All']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`text-xs font-semibold px-3 py-2 rounded-md transition-colors ${view === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div></div>
      {shown.slice(0, 4).map(b => <div key={b.id} className="py-4 border-t border-border first:border-0"><div className="flex justify-between gap-4"><div><p className="font-semibold text-sm">{b.name}</p><p className="text-xs text-muted-foreground mt-1">{b.dateLabel} · {b.classification === 'unknown' ? 'Status unknown' : b.classification === 'flagged' ? `Recorded ${b.status}` : 'Recorded in range'}</p></div><p className="font-semibold tabular-nums text-lg shrink-0">{b.value}<span className="text-xs text-muted-foreground font-normal ml-1">{b.unit}</span></p></div>{b.change && <p className="text-xs text-muted-foreground mt-2">{b.change}</p>}<div className="flex flex-wrap gap-4 mt-3"><button onClick={() => ask(`Help me understand my ${b.name} results, what context is missing, and what questions I should explore next.`)} className="inline-flex gap-1.5 items-center text-xs font-semibold text-primary"><MessageSquare className="h-3.5 w-3.5" />Understand this</button><Link href={`/insights?q=${encodeURIComponent(b.name)}`} className="inline-flex gap-1.5 items-center text-xs font-semibold text-primary"><BookOpen className="h-3.5 w-3.5" />Explore research</Link></div></div>)}
      {!shown.length && <div className="py-7"><p className="font-medium">{!brief.latest.length ? "Your baseline starts here." : view === 'changes' ? 'No comparable changes yet.' : view === 'flagged' ? 'No recorded flags in this view.' : 'No results yet.'}</p><p className="text-sm text-muted-foreground mt-2 leading-relaxed">{!brief.latest.length ? 'Add a lab report to see your recorded ranges, follow changes over time, and ask more specific questions.' : view === 'changes' ? 'Changes require numeric results with matching units and different valid dates. A change alone does not mean improvement or decline.' : 'Unknown statuses remain unknown. You can review all markers and their original ranges in Health Records.'}</p><Link href="/data?tab=labResults" className="inline-flex gap-2 items-center text-sm text-primary font-semibold mt-4">{brief.latest.length ? 'Review records' : 'Add your first results'}<ArrowRight className="h-4 w-4" /></Link></div>}
      {shown.length > 4 && <Link href="/data?tab=labResults" className="text-sm text-primary font-semibold">See all {shown.length} results →</Link>}
    </div>}
    <details className="health-panel p-6 group"><summary className="cursor-pointer list-none flex items-center justify-between gap-4"><div><p className="eyebrow">Optional wellness indicator</p><p className="font-semibold mt-2">Cardiometabolic snapshot <span className="text-muted-foreground font-normal">· {scoreLoading ? 'Loading' : scoreError ? 'Unavailable' : hs?.measured ? `${hs.score}/100` : 'Not enough data'}</span></p></div><ArrowRight className="h-4 w-4 shrink-0 group-open:rotate-90 transition-transform" /></summary><div className="mt-5 space-y-4 border-t border-border pt-4"><p className="text-sm text-muted-foreground">A simplified estimate from {hs?.measured ?? 0} of {hs?.total ?? 7} supported factors. This is not a validated total-health score. Missing factors are excluded, so different coverage can change the meaning of the number.</p>{hs?.components.map(c => <div key={c.key}><div className="flex justify-between text-sm gap-3"><span className="font-medium">{c.label}</span><span className="tabular-nums">{c.score == null ? 'Missing' : `${c.score}/100`}</span></div><div className="h-1 bg-secondary rounded-full my-2"><div className="h-1 bg-primary rounded-full" style={{ width: `${c.score ?? 0}%` }} /></div><p className="text-xs text-muted-foreground">{hs.provenance[c.key]?.reason || hs.provenance[c.key]?.source}{hs.provenance[c.key]?.date ? ` · ${hs.provenance[c.key].date!.slice(0,10)}` : ''}</p></div>)}<p className="text-xs text-muted-foreground leading-relaxed">Formula: sum of available factor scores ÷ number of available factors, rounded. Inspired by AHA categories; diet and medication/history adjustments are absent. Activity needs measured minutes. Observations can come from different dates and are not automatically excluded for age.</p></div></details>
  </section>
}
