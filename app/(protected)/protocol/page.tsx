"use client"

import * as React from "react"
import { Header } from "@/components/header"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import {
  Footprints, Utensils, Pill, Moon, Wind, Ban, Activity,
  Sparkles, Check, RefreshCw, Loader2,
} from "lucide-react"

const CAT: Record<string, { icon: any; label: string }> = {
  movement:   { icon: Footprints, label: "Movement" },
  nutrition:  { icon: Utensils,   label: "Nutrition" },
  supplement: { icon: Pill,       label: "Supplement" },
  sleep:      { icon: Moon,       label: "Sleep" },
  stress:     { icon: Wind,       label: "Stress" },
  avoid:      { icon: Ban,        label: "Avoid" },
  tracking:   { icon: Activity,   label: "Track" },
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function ProtocolPage() {
  const { user } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [protocol, setProtocol] = React.useState<any>(null)
  const [tasks, setTasks] = React.useState<any[]>([])
  const [doneToday, setDoneToday] = React.useState<Set<string>>(new Set())

  React.useEffect(() => { if (user) load() }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const { data: protos } = await supabase
      .from("protocols")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("generated_at", { ascending: false })
      .limit(1)

    const active = protos?.[0] || null
    setProtocol(active)

    if (active) {
      const [{ data: t }, { data: comps }] = await Promise.all([
        supabase.from("protocol_tasks").select("*").eq("protocol_id", active.id)
          .order("priority", { ascending: true }).order("sort_order", { ascending: true }),
        supabase.from("task_completions").select("task_id").eq("user_id", user.id).eq("completed_date", todayStr()),
      ])
      setTasks(t || [])
      setDoneToday(new Set((comps || []).map((c: any) => c.task_id)))
    } else {
      setTasks([])
      setDoneToday(new Set())
    }
    setLoading(false)
  }

  // Gather a compact health summary for the generator
  async function buildSummary(): Promise<string> {
    if (!user) return ""
    const [profileRes, condRes, medRes, bioRes] = await Promise.all([
      supabase.from("profiles").select("full_name, date_of_birth, gender, height_inches, weight_lbs").eq("id", user.id).maybeSingle(),
      supabase.from("conditions").select("name, status, severity").eq("user_id", user.id).limit(40),
      supabase.from("medications").select("name, dosage, frequency").eq("user_id", user.id).limit(40),
      supabase.from("biomarkers").select("name, value, unit, status, test_date").eq("user_id", user.id).order("test_date", { ascending: false }).limit(40),
    ])
    const p: any = profileRes.data
    const lines: string[] = []
    const person: string[] = []
    if (p?.gender) person.push(p.gender)
    if (p?.date_of_birth) {
      const age = Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000)
      if (age > 0 && age < 130) person.push(`${age}y`)
    }
    if (p?.weight_lbs) person.push(`${p.weight_lbs} lbs`)
    if (person.length) lines.push(`Profile: ${person.join(", ")}.`)
    const conds = (condRes.data || []) as any[]
    if (conds.length) lines.push("Conditions: " + conds.map(c => `${c.name}${c.status ? ` (${c.status})` : ""}`).join("; ") + ".")
    const meds = (medRes.data || []) as any[]
    if (meds.length) lines.push("Medications: " + meds.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ""}`).join("; ") + ".")
    const bios = (bioRes.data || []) as any[]
    if (bios.length) {
      const flagged = bios.filter(b => b.status && !["optimal", "normal"].includes(b.status))
      const show = (flagged.length ? flagged : bios).slice(0, 24)
      lines.push("Lab results: " + show.map(b => `${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ""}${b.status ? ` [${b.status}]` : ""}`).join("; ") + ".")
    }
    return lines.join("\n")
  }

  async function generate() {
    if (!user || generating) return
    setGenerating(true)
    setError(null)
    try {
      const summary = await buildSummary()
      if (!summary) {
        setError("Add some health data first (conditions, medications, or lab results) so we can build your protocol.")
        setGenerating(false)
        return
      }
      const res = await fetch("/api/protocol/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthSummary: summary }),
      })
      const gen = await res.json()
      if (!res.ok) throw new Error(gen.error || "Generation failed")

      // Archive any previous active protocol
      await supabase.from("protocols").update({ status: "archived" }).eq("user_id", user.id).eq("status", "active")

      const retest = new Date(); retest.setDate(retest.getDate() + 56)
      const full = new Date(); full.setDate(full.getDate() + 84)

      const { data: proto, error: pErr } = await supabase.from("protocols").insert({
        user_id: user.id,
        phase: "baseline",
        health_score: gen.health_score,
        health_score_target: gen.health_score_target,
        plain_summary: gen.plain_summary,
        issues_ranked: gen.issues_ranked,
        interventions: gen.tasks,
        retest_date: retest.toISOString().slice(0, 10),
        full_retest_date: full.toISOString().slice(0, 10),
        status: "active",
      }).select().single()
      if (pErr || !proto) throw new Error(pErr?.message || "Could not save protocol")

      const rows = (gen.tasks || []).map((t: any) => ({
        user_id: user.id,
        protocol_id: proto.id,
        task_name: t.task_name,
        description: t.description,
        why_it_matters: t.why_it_matters,
        category: t.category,
        frequency: t.frequency,
        priority: t.priority,
        evidence_level: t.evidence_level,
        cost_estimate: t.cost_estimate,
        sort_order: t.sort_order,
        kanban_status: "todo",
        is_recurring: true,
      }))
      const { error: tErr } = await supabase.from("protocol_tasks").insert(rows)
      if (tErr) throw new Error(tErr.message)

      await load()
    } catch (e: any) {
      setError(e?.message || "Something went wrong generating your protocol.")
    } finally {
      setGenerating(false)
    }
  }

  async function toggle(task: any) {
    if (!user) return
    const isDone = doneToday.has(task.id)
    const next = new Set(doneToday)
    if (isDone) {
      next.delete(task.id)
      setDoneToday(next)
      await supabase.from("task_completions").delete().eq("user_id", user.id).eq("task_id", task.id).eq("completed_date", todayStr())
    } else {
      next.add(task.id)
      setDoneToday(next)
      await supabase.from("task_completions").insert({ user_id: user.id, task_id: task.id, completed_date: todayStr() })
    }
  }

  const completedCount = doneToday.size
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-24 md:pb-12">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Your Protocol</h1>
            <p className="text-sm text-muted-foreground mt-0.5">A few specific, evidence-based actions built from your data.</p>
          </div>
          {protocol && (
            <button onClick={generate} disabled={generating}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-health-danger/30 bg-health-danger/10 px-4 py-3 text-sm text-health-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !protocol ? (
          // Empty state — generate
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-medium text-foreground">Build your wellness protocol</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Healyx reads your profile, conditions, medications, and labs, then gives you a short, prioritized plan — and tracks whether it&apos;s working.
            </p>
            <button onClick={generate} disabled={generating}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate my protocol</>}
            </button>
            <p className="mt-4 text-[11px] text-muted-foreground/70 max-w-sm mx-auto">
              Educational wellness guidance, not medical advice. Always consult a doctor before starting anything new.
            </p>
          </div>
        ) : (
          <>
            {/* Summary + score */}
            <div className="rounded-2xl border border-health-optimal/20 bg-health-optimal/[0.06] p-5 mb-5">
              <div className="flex items-start gap-4">
                <div className="text-center shrink-0">
                  <p className="text-3xl font-medium text-foreground leading-none">{Math.round(protocol.health_score ?? 0)}</p>
                  <p className="text-[11px] text-health-optimal/90 mt-1">score</p>
                  {protocol.health_score_target != null && (
                    <p className="text-[11px] text-muted-foreground mt-1">target {Math.round(protocol.health_score_target)}</p>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Your snapshot</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{protocol.plain_summary || "Your personalized protocol is ready."}</p>
                </div>
              </div>
            </div>

            {/* Today's progress */}
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-sm font-medium text-foreground">Today&apos;s plan</p>
              <p className="text-xs text-muted-foreground">{completedCount}/{tasks.length} done · {pct}%</p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary mb-4 overflow-hidden">
              <div className="h-full rounded-full bg-health-optimal transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>

            {/* Task list */}
            <div className="space-y-2.5">
              {tasks.map((t) => {
                const done = doneToday.has(t.id)
                const cfg = CAT[t.category] || CAT.tracking
                const Icon = cfg.icon
                return (
                  <div key={t.id}
                    className={`rounded-xl border p-3.5 transition-colors ${done ? "border-health-optimal/30 bg-health-optimal/[0.05]" : "border-border bg-card"}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggle(t)} aria-label={done ? "Mark not done" : "Mark done"}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${done ? "bg-health-optimal border-health-optimal text-background" : "border-border hover:border-primary"}`}>
                        {done && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.task_name}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                            <Icon className="h-3 w-3" />{cfg.label}
                          </span>
                          {t.frequency && <span className="text-[10px] text-muted-foreground/70">{t.frequency}</span>}
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                        {t.why_it_matters && <p className="text-xs text-primary/80 mt-1">Why: {t.why_it_matters}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          {t.evidence_level && <span className="text-[10px] text-muted-foreground/70">Evidence: {t.evidence_level}</span>}
                          {t.cost_estimate && <span className="text-[10px] text-muted-foreground/70">· {t.cost_estimate}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-6 text-[11px] text-muted-foreground/70 text-center">
              Educational wellness guidance, not medical advice. Retest around {protocol.retest_date || "week 8"}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
