"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRight, Activity, ShieldCheck, CircleHelp, ArrowRight } from "lucide-react"
import { useBiomarkers } from "@/hooks/useBiomarkers"
import { useAuth } from "@/components/AuthContext"
import { loadHealthScore, type LoadedHealthScore } from "@/lib/clientHealth"

const ATTENTION = new Set(["high", "low", "borderline", "critical", "out-of-range"])
const SEVERITY: Record<string, number> = { critical: 0, "out-of-range": 1, high: 2, low: 2, borderline: 3 }

export function HealthSnapshot() {
  const { biomarkers, loading, error: biomarkerError } = useBiomarkers()
  const { user } = useAuth()
  const [hs, setHs] = React.useState<LoadedHealthScore | null>(null)
  const [scoreLoading, setScoreLoading] = React.useState(true)
  const [scoreError, setScoreError] = React.useState(false)

  React.useEffect(() => {
    if (!user) { setScoreLoading(false); return }
    let active = true
    setScoreLoading(true)
    loadHealthScore(user.id).then(data => { if (active) { setHs(data); setScoreError(false) } })
      .catch(() => { if (active) setScoreError(true) })
      .finally(() => { if (active) setScoreLoading(false) })
    return () => { active = false }
  }, [user])

  // Show each marker's most recent dated result, rather than counting its entire history.
  const latest = React.useMemo(() => {
    const sorted = [...(biomarkers || [])].sort((a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime())
    return sorted.filter((b, i) => sorted.findIndex(x => x.name.toLowerCase() === b.name.toLowerCase()) === i)
  }, [biomarkers])
  const attention = latest.filter(b => ATTENTION.has(b.status)).sort((a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9))
  const inRange = latest.filter(b => ["optimal", "normal"].includes(b.status)).length
  const hasScore = !!hs?.measured
  const score = hasScore ? hs!.score : null

  return (
    <section className="space-y-5" aria-label="Your health overview">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="health-panel sm:col-span-2 p-6 sm:p-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Cardiometabolic snapshot</p><Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-end gap-4 mt-5">
            <p className="text-6xl font-semibold tracking-[-0.06em] tabular-nums">{scoreLoading ? "…" : score ?? "—"}<span className="text-base text-muted-foreground tracking-normal font-medium ml-2">/ 100</span></p>
            <span className="mb-2 text-xs font-semibold rounded-full px-3 py-1.5 bg-primary/10 text-primary">{scoreLoading ? "Loading" : scoreError ? "Unavailable" : hasScore ? "Partial picture" : "Build your baseline"}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed">{scoreError ? "We couldn't load your score. Your records are still available below." : hasScore ? `Based on ${hs!.measured} of ${hs!.total} supported factors. Each available factor has equal weight.` : "Your first results and health profile will create a starting point. Missing information never counts as zero."}</p>
          <details className="mt-5 border-t border-border pt-4 group">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold list-none"><span className="flex gap-2 items-center"><CircleHelp className="h-4 w-4 text-primary" /> What goes into this number?</span><ArrowRight className="h-4 w-4 group-open:rotate-90 transition-transform" /></summary>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">A wellness estimate inspired by the AHA’s Life’s Essential 8. This implementation supports seven factors; diet is not yet included. Activity remains missing until duration can be measured; exercise days alone are insufficient. It is not a complete LE8 assessment or a measure of total health.</p>
              {hs?.components?.map(c => <div key={c.key} className="grid grid-cols-[110px_1fr_60px] gap-3 items-center text-xs"><span>{c.label}</span><div className="h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${c.score ?? 0}%` }} /></div><span className="text-right text-muted-foreground tabular-nums">{c.score == null ? "Missing" : `${c.score}/100`}</span></div>)}
              <p className="text-xs text-muted-foreground">Formula: sum of available factor scores ÷ number of available factors, rounded to the nearest whole number. Results depend on the accuracy and age of your records.</p>
              <Link href="/protocol" className="inline-flex gap-1 items-center text-xs font-semibold text-primary">Build your action plan <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
          </details>
        </div>
        <div className="health-panel p-6 flex flex-col justify-between gap-6">
          <div className="flex justify-between"><p className="eyebrow">Latest lab signals</p><ShieldCheck className="h-4 w-4 text-primary" /></div>
          <div><p className="text-4xl font-semibold tracking-tight tabular-nums">{loading ? "…" : biomarkerError ? "—" : inRange}<span className="text-sm text-muted-foreground font-normal ml-2">in range</span></p><p className="text-sm text-muted-foreground mt-2">{loading ? "Reading your records…" : biomarkerError ? "Results could not be loaded. Open your records to try again." : latest.length ? `${attention.length} flagged · ${latest.length} markers on file` : "No lab results on file yet"}</p></div>
          <Link href="/data?tab=labResults" className="flex justify-between items-center border-t border-border pt-4 text-sm font-semibold">{latest.length ? "Review your results" : "Add your first results"}<ArrowUpRight className="h-4 w-4 text-primary" /></Link>
        </div>
      </div>
      {attention.length > 0 && <div className="health-panel p-6"><div className="flex justify-between gap-3 mb-5"><div><p className="eyebrow">Worth a closer look</p><h2 className="text-lg font-semibold mt-1">Your flagged results</h2></div><Link href="/data?tab=labResults" className="text-xs font-semibold text-primary self-center">View all <span aria-hidden>↗</span></Link></div><div className="grid sm:grid-cols-2 gap-3">{attention.slice(0, 4).map(b => <Link href="/data?tab=labResults" key={b.id} className="flex justify-between items-center rounded-xl bg-secondary/60 border border-border/60 p-4 transition-colors hover:bg-secondary"><div><p className="text-sm font-medium">{b.name}</p><p className="text-xs text-muted-foreground mt-1 capitalize">{b.status} · {new Date(b.test_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p></div><p className="text-lg font-semibold tabular-nums">{b.value}<span className="text-xs font-normal text-muted-foreground ml-1">{b.unit}</span></p></Link>)}</div><p className="text-xs text-muted-foreground mt-4">Flags reflect the status recorded with your result. Discuss their meaning with your clinician.</p></div>}
      {hs?.pheno && <div className="health-panel px-6 py-4 flex gap-5 items-center"><p className="text-3xl font-semibold tabular-nums">{hs.pheno.phenoAge}<span className="text-xs text-muted-foreground ml-1">years</span></p><div><p className="text-sm font-semibold">Phenotypic age estimate</p><p className="text-xs text-muted-foreground mt-1">Levine PhenoAge model · chronological age {hs.pheno.chronological}. A lab-based statistical estimate, not a diagnosis.</p></div></div>}
    </section>
  )
}
