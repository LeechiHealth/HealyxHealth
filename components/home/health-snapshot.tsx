"use client"

import * as React from "react"
import Link from "next/link"
import { useBiomarkers } from "@/hooks/useBiomarkers"
import { useAuth } from "@/components/AuthContext"
import { supabase } from "@/lib/supabase/client"
import { computeHealthScore } from "@/lib/healthScore"

// Status buckets
const ATTENTION = new Set(["high", "low", "borderline", "critical", "out-of-range"])
const GOOD = new Set(["optimal", "normal"])

// Severity ordering for "needs attention" (most severe first)
const SEVERITY: Record<string, number> = {
  critical: 0, "out-of-range": 1, high: 2, low: 2, borderline: 3,
}

// Weighting for the composite score
const WEIGHT: Record<string, number> = {
  optimal: 1.0, normal: 0.85, borderline: 0.5, low: 0.4, high: 0.35,
  critical: 0.2, "out-of-range": 0.3,
}

function firstName(user: any): string {
  const n =
    user?.user_metadata?.first_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    ""
  return typeof n === "string" && n.trim() ? n.trim().split(" ")[0] : "there"
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export function HealthSnapshot() {
  const { biomarkers, loading } = useBiomarkers()
  const { user } = useAuth()
  const [extra, setExtra] = React.useState<{ vitals: any; profile: any; intake: any }>({ vitals: null, profile: null, intake: null })

  React.useEffect(() => {
    if (!user) return
    ;(async () => {
      const [vRes, pRes, iRes] = await Promise.all([
        supabase.from("vitals").select("systolic_bp, diastolic_bp, bmi, blood_glucose, recorded_at").eq("user_id", user.id).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("profiles").select("height_inches, weight_lbs").eq("id", user.id).maybeSingle(),
        supabase.from("intake_responses").select("sleep_hours, exercise_days").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      setExtra({ vitals: vRes.data, profile: pRes.data, intake: iRes.data })
    })()
  }, [user])

  // Health score via the AHA Life's Essential 8 method (see lib/healthScore.ts)
  const { score, label, attention } = React.useMemo(() => {
    const bios = biomarkers || []
    const bioVal = (subs: string[]) => {
      const b = bios.find((x: any) => x.name && subs.some((s) => x.name.toLowerCase().includes(s)))
      return b ? Number(b.value) : null
    }
    const v = extra.vitals || {}, p = extra.profile || {}, ik = extra.intake || {}
    const total = bioVal(["total cholesterol", "cholesterol, total"])
    const hdl = bioVal(["hdl"])
    const ldl = bioVal(["ldl"])
    const nonHDL = total != null && hdl != null ? total - hdl : ldl != null ? ldl + 30 : null
    const bmi = (v.bmi != null ? Number(v.bmi) : null)
      ?? (p.height_inches && p.weight_lbs ? (703 * Number(p.weight_lbs)) / (Number(p.height_inches) ** 2) : null)

    const { score, grade } = computeHealthScore({
      systolic: v.systolic_bp ?? null,
      diastolic: v.diastolic_bp ?? null,
      hba1c: bioVal(["a1c"]),
      fastingGlucose: (v.blood_glucose != null ? Number(v.blood_glucose) : null) ?? bioVal(["glucose"]),
      nonHDL,
      bmi,
      sleepHours: ik.sleep_hours != null ? Number(ik.sleep_hours) : null,
      activityMinutes: ik.exercise_days != null ? Number(ik.exercise_days) * 30 : null,
      nicotine: null,
    })

    const attention = bios
      .filter((b: any) => b.status && ATTENTION.has(b.status))
      .sort((a: any, b: any) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9))

    return { score, label: grade, attention }
  }, [biomarkers, extra])

  // Ring geometry
  const R = 26
  const C = 2 * Math.PI * R
  const pct = Math.max(0, Math.min(100, score))
  const dash = (pct / 100) * C

  return (
    <section className="mt-4">
      {/* Greeting */}
      <div className="px-1 mb-3">
        <p className="text-xs text-muted-foreground">{greeting()}, {firstName(user)}</p>
        <h2 className="text-lg sm:text-xl font-medium text-foreground mt-0.5">
          Here&apos;s your health today
        </h2>
      </div>

      {/* Health score */}
      <div className="rounded-2xl border border-health-optimal/20 bg-health-optimal/[0.06] p-4 sm:p-5 flex items-center gap-4 sm:gap-5">
        <div className="relative shrink-0">
          <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
            <circle cx="34" cy="34" r={R} fill="none" strokeWidth="5"
              className="stroke-health-optimal/15" />
            <circle cx="34" cy="34" r={R} fill="none" strokeWidth="5" strokeLinecap="round"
              className="stroke-health-optimal transition-[stroke-dasharray] duration-700"
              strokeDasharray={`${dash} ${C}`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-medium text-foreground">
            {loading ? "" : score || "—"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-health-optimal/90">Health score</p>
          <p className="text-base font-medium text-foreground mt-0.5">
            {loading ? "Calculating…" : label}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {loading
              ? " "
              : attention.length === 0
              ? "All tracked markers look good"
              : `${attention.length} marker${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} attention`}
          </p>
        </div>
      </div>

      {/* Needs attention */}
      {!loading && attention.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Needs attention
            </p>
            {attention.length > 4 && (
              <Link href="/data?tab=labResults" className="text-xs text-primary hover:opacity-80 transition-opacity">
                View all {attention.length}
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {attention.slice(0, 4).map((b: any) => {
              const danger = b.status === "high" || b.status === "low" || b.status === "critical" || b.status === "out-of-range"
              const tone = danger ? "text-health-danger" : "text-health-warning"
              return (
                <div key={b.id} className="rounded-xl bg-card border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground truncate">{b.name}</p>
                  <p className={`text-lg font-medium mt-1 ${tone}`}>
                    {b.value}
                    {b.unit ? <span className="text-xs font-normal ml-1">{b.unit}</span> : null}
                  </p>
                  <p className={`text-[11px] mt-0.5 capitalize ${tone}`}>{b.status}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
