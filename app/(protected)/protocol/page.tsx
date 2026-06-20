"use client"

import * as React from "react"
import { Header } from "@/components/header"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import {
  Footprints, Utensils, Pill, Moon, Wind, Ban, Activity,
  Sparkles, Check, RefreshCw, Loader2, List, LayoutGrid, CalendarDays,
  ChevronLeft, ChevronRight,
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

const KANBAN = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
] as const

const fmt = (d: Date) => d.toISOString().slice(0, 10)
const todayStr = () => fmt(new Date())
function currentWeek(): Date[] {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay()) // Sunday
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

type View = "list" | "board" | "week"

export default function ProtocolPage() {
  const { user } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [protocol, setProtocol] = React.useState<any>(null)
  const [tasks, setTasks] = React.useState<any[]>([])
  const [doneToday, setDoneToday] = React.useState<Set<string>>(new Set())
  const [weekDone, setWeekDone] = React.useState<Set<string>>(new Set()) // `${taskId}|${date}`
  const [view, setView] = React.useState<View>("list")
  const [dragId, setDragId] = React.useState<string | null>(null)

  const week = React.useMemo(() => currentWeek(), [])

  React.useEffect(() => { if (user) load() }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const { data: protos } = await supabase
      .from("protocols").select("*")
      .eq("user_id", user.id).eq("status", "active")
      .order("generated_at", { ascending: false }).limit(1)

    const active = protos?.[0] || null
    setProtocol(active)

    if (active) {
      const [{ data: t }, { data: comps }] = await Promise.all([
        supabase.from("protocol_tasks").select("*").eq("protocol_id", active.id)
          .order("priority", { ascending: true }).order("sort_order", { ascending: true }),
        supabase.from("task_completions").select("task_id, completed_date")
          .eq("user_id", user.id).gte("completed_date", fmt(week[0])).lte("completed_date", fmt(week[6])),
      ])
      setTasks(t || [])
      const wd = new Set<string>()
      const td = new Set<string>()
      const today = todayStr()
      for (const c of comps || []) {
        wd.add(`${c.task_id}|${c.completed_date}`)
        if (c.completed_date === today) td.add(c.task_id)
      }
      setWeekDone(wd)
      setDoneToday(td)
    } else {
      setTasks([]); setDoneToday(new Set()); setWeekDone(new Set())
    }
    setLoading(false)
  }

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
    setGenerating(true); setError(null)
    try {
      const summary = await buildSummary()
      if (!summary) {
        setError("Add some health data first (conditions, medications, or lab results) so we can build your protocol.")
        setGenerating(false); return
      }
      const res = await fetch("/api/protocol/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthSummary: summary }),
      })
      const gen = await res.json()
      if (!res.ok) throw new Error(gen.error || "Generation failed")

      await supabase.from("protocols").update({ status: "archived" }).eq("user_id", user.id).eq("status", "active")
      const retest = new Date(); retest.setDate(retest.getDate() + 56)
      const full = new Date(); full.setDate(full.getDate() + 84)

      const { data: proto, error: pErr } = await supabase.from("protocols").insert({
        user_id: user.id, phase: "baseline",
        health_score: gen.health_score, health_score_target: gen.health_score_target,
        plain_summary: gen.plain_summary, issues_ranked: gen.issues_ranked, interventions: gen.tasks,
        retest_date: retest.toISOString().slice(0, 10), full_retest_date: full.toISOString().slice(0, 10),
        status: "active",
      }).select().single()
      if (pErr || !proto) throw new Error(pErr?.message || "Could not save protocol")

      const rows = (gen.tasks || []).map((t: any) => ({
        user_id: user.id, protocol_id: proto.id, task_name: t.task_name, description: t.description,
        why_it_matters: t.why_it_matters, category: t.category, frequency: t.frequency, priority: t.priority,
        evidence_level: t.evidence_level, cost_estimate: t.cost_estimate, sort_order: t.sort_order,
        kanban_status: "todo", is_recurring: true,
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

  // Toggle completion for a specific date (used by list = today, and week view)
  async function toggleDay(task: any, dateStr: string) {
    if (!user) return
    const key = `${task.id}|${dateStr}`
    const has = weekDone.has(key) || (dateStr === todayStr() && doneToday.has(task.id))
    const wd = new Set(weekDone); const td = new Set(doneToday)
    if (has) {
      wd.delete(key); if (dateStr === todayStr()) td.delete(task.id)
      setWeekDone(wd); setDoneToday(td)
      await supabase.from("task_completions").delete()
        .eq("user_id", user.id).eq("task_id", task.id).eq("completed_date", dateStr)
    } else {
      wd.add(key); if (dateStr === todayStr()) td.add(task.id)
      setWeekDone(wd); setDoneToday(td)
      await supabase.from("task_completions").insert({ user_id: user.id, task_id: task.id, completed_date: dateStr })
    }
  }

  // Move a task between kanban columns
  async function moveTask(taskId: string, status: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, kanban_status: status } : t))
    await supabase.from("protocol_tasks").update({ kanban_status: status }).eq("id", taskId)
  }

  const completedCount = doneToday.size
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0

  const VIEWS: { key: View; label: string; icon: any }[] = [
    { key: "list", label: "List", icon: List },
    { key: "board", label: "Board", icon: LayoutGrid },
    { key: "week", label: "Week", icon: CalendarDays },
  ]

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 pb-24 md:pb-12">

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
          <div className="mb-4 rounded-xl border border-health-danger/30 bg-health-danger/10 px-4 py-3 text-sm text-health-danger">{error}</div>
        )}

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !protocol ? (
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
            <div className="rounded-2xl border border-health-optimal/20 bg-health-optimal/[0.06] p-5 mb-4">
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

            {/* View toggle */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="inline-flex rounded-full border border-border bg-card p-1">
                {VIEWS.map(v => {
                  const Icon = v.icon
                  const active = view === v.key
                  return (
                    <button key={v.key} onClick={() => setView(v.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" />{v.label}
                    </button>
                  )
                })}
              </div>
              {view === "list" && (
                <p className="text-xs text-muted-foreground">{completedCount}/{tasks.length} done today · {pct}%</p>
              )}
            </div>

            {/* ───────── LIST ───────── */}
            {view === "list" && (
              <>
                <div className="h-1.5 w-full rounded-full bg-secondary mb-4 overflow-hidden">
                  <div className="h-full rounded-full bg-health-optimal transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-2.5">
                  {tasks.map((t) => {
                    const done = doneToday.has(t.id)
                    const cfg = CAT[t.category] || CAT.tracking
                    const Icon = cfg.icon
                    return (
                      <div key={t.id}
                        className={`rounded-xl border p-3.5 transition-colors ${done ? "border-health-optimal/30 bg-health-optimal/[0.05]" : "border-border bg-card"}`}>
                        <div className="flex items-start gap-3">
                          <button onClick={() => toggleDay(t, todayStr())} aria-label={done ? "Mark not done" : "Mark done"}
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
              </>
            )}

            {/* ───────── BOARD (kanban) ───────── */}
            {view === "board" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {KANBAN.map((col, ci) => {
                  const colTasks = tasks.filter(t => (t.kanban_status || "todo") === col.key)
                  return (
                    <div key={col.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (dragId) moveTask(dragId, col.key); setDragId(null) }}
                      className="rounded-xl border border-border bg-card/50 p-2.5 min-h-[120px]">
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="text-xs font-medium text-foreground">{col.label}</span>
                        <span className="text-[10px] text-muted-foreground">{colTasks.length}</span>
                      </div>
                      <div className="space-y-2">
                        {colTasks.map(t => {
                          const cfg = CAT[t.category] || CAT.tracking
                          const Icon = cfg.icon
                          return (
                            <div key={t.id} draggable
                              onDragStart={() => setDragId(t.id)}
                              onDragEnd={() => setDragId(null)}
                              className="rounded-lg border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing">
                              <div className="flex items-start gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                <span className="text-xs font-medium text-foreground leading-snug">{t.task_name}</span>
                              </div>
                              {t.frequency && <p className="text-[10px] text-muted-foreground mt-1 ml-5">{t.frequency}</p>}
                              {/* mobile-friendly move controls */}
                              <div className="flex items-center justify-end gap-1 mt-1.5">
                                {ci > 0 && (
                                  <button onClick={() => moveTask(t.id, KANBAN[ci - 1].key)} aria-label="Move left"
                                    className="text-muted-foreground hover:text-primary"><ChevronLeft className="h-3.5 w-3.5" /></button>
                                )}
                                {ci < KANBAN.length - 1 && (
                                  <button onClick={() => moveTask(t.id, KANBAN[ci + 1].key)} aria-label="Move right"
                                    className="text-muted-foreground hover:text-primary"><ChevronRight className="h-3.5 w-3.5" /></button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {colTasks.length === 0 && (
                          <p className="text-[10px] text-muted-foreground/50 text-center py-3">Drop tasks here</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ───────── WEEK (calendar) ───────── */}
            {view === "week" && (
              <div className="space-y-2.5">
                {week.map((d) => {
                  const ds = fmt(d)
                  const isToday = ds === todayStr()
                  const isFuture = d.getTime() > new Date().setHours(23, 59, 59, 999)
                  const dayName = d.toLocaleDateString("en-US", { weekday: "short" })
                  const dayNum = d.getDate()
                  const doneCount = tasks.filter(t => weekDone.has(`${t.id}|${ds}`)).length
                  return (
                    <div key={ds}
                      className={`rounded-xl border p-3.5 ${isToday ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-card"}`}>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isToday ? "text-primary" : "text-foreground"}`}>{dayName} {dayNum}</span>
                          {isToday && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">Today</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{doneCount}/{tasks.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tasks.map(t => {
                          const done = weekDone.has(`${t.id}|${ds}`)
                          const cfg = CAT[t.category] || CAT.tracking
                          const Icon = cfg.icon
                          return (
                            <button key={t.id} onClick={() => !isFuture && toggleDay(t, ds)} disabled={isFuture}
                              title={t.task_name}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${done ? "border-health-optimal/40 bg-health-optimal/15 text-health-optimal" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                              {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                              <span className="max-w-[140px] truncate">{t.task_name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="mt-6 text-[11px] text-muted-foreground/70 text-center">
              Educational wellness guidance, not medical advice. Retest around {protocol.retest_date || "week 8"}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
