"use client"

import * as React from "react"
import { Header } from "@/components/header"
import { ProtocolIntake } from "@/components/protocol/protocol-intake"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import {
  Footprints, Utensils, Pill, Moon, Wind, Ban, Activity,
  Sparkles, Check, RefreshCw, Loader2, List, LayoutGrid, CalendarDays,
  ChevronLeft, ChevronRight, ChevronDown,
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

const fmt = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
const todayStr = () => fmt(new Date())

function currentWeek(): Date[] {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}
function buildMonthGrid(ref: Date) {
  const y = ref.getFullYear(), m = ref.getMonth()
  const startDow = new Date(y, m, 1).getDay()
  const start = new Date(y, m, 1 - startDow)
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  return { days, month: m }
}
const windowStart = () => { const d = new Date(); d.setDate(d.getDate() - 38); return fmt(d) }
const windowEnd = () => { const d = new Date(); d.setDate(d.getDate() + 8); return fmt(d) }

type View = "list" | "board" | "calendar"

export default function ProtocolPage() {
  const { user } = useAuth()
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [draft, setDraft] = React.useState<any>(null)
  const [selectedActions, setSelectedActions] = React.useState<Set<number>>(new Set())
  const [saving, setSaving] = React.useState(false)
  const pendingUpdates = React.useRef(new Set<string>())
  const [error, setError] = React.useState<string | null>(null)
  const [protocol, setProtocol] = React.useState<any>(null)
  const [tasks, setTasks] = React.useState<any[]>([])
  const [doneToday, setDoneToday] = React.useState<Set<string>>(new Set())
  const [done, setDone] = React.useState<Set<string>>(new Set()) // `${taskId}|${date}`
  const [view, setView] = React.useState<View>("list")
  const [calMode, setCalMode] = React.useState<"month" | "week">("month")
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [intake, setIntake] = React.useState<any>(null)
  const [intakeOpen, setIntakeOpen] = React.useState(false)
  const [basedOnOpen, setBasedOnOpen] = React.useState(false)

  const week = React.useMemo(() => currentWeek(), [])
  const monthGrid = React.useMemo(() => buildMonthGrid(new Date()), [])

  React.useEffect(() => {
    setProtocol(null); setTasks([]); setDraft(null); setDone(new Set()); setDoneToday(new Set())
    if (user) load()
    else setLoading(false)
  }, [user])

  async function load() {
    if (!user) return
    setLoading(true)
    const { data: protos, error: protocolError } = await supabase
      .from("protocols").select("*")
      .eq("user_id", user.id).eq("status", "active")
      .order("generated_at", { ascending: false }).limit(1)

    if (protocolError) { setError("Your saved plan could not be loaded. Please refresh to try again."); setLoading(false); return }
    const active = protos?.[0] || null
    setProtocol(active)

    const { data: ik } = await supabase.from("intake_responses").select("*")
      .eq("user_id", user.id).eq("completed", true).order("completed_at", { ascending: false }).limit(1).maybeSingle()
    setIntake(ik || null)


    if (active) {
      const [taskResult, completionResult] = await Promise.all([
        supabase.from("protocol_tasks").select("*").eq("protocol_id", active.id)
          .order("priority", { ascending: true }).order("sort_order", { ascending: true }),
        supabase.from("task_completions").select("task_id, completed_date")
          .eq("user_id", user.id).gte("completed_date", windowStart()).lte("completed_date", windowEnd()),
      ])
      if (taskResult.error || completionResult.error) {
        setError("Some saved actions could not be loaded. Please refresh before making changes.")
        setLoading(false)
        return
      }
      const t = taskResult.data
      const comps = completionResult.data
      setTasks(t || [])
      const dn = new Set<string>(); const td = new Set<string>(); const today = todayStr()
      for (const c of comps || []) { dn.add(`${c.task_id}|${c.completed_date}`); if (c.completed_date === today) td.add(c.task_id) }
      setDone(dn); setDoneToday(td)
    } else {
      setTasks([]); setDoneToday(new Set()); setDone(new Set())
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
    if ([profileRes, condRes, medRes, bioRes].some(result => result.error)) {
      throw new Error("Some health records could not be loaded. Try again before generating a plan.")
    }
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
      lines.push("Lab results: " + show.map(b => `${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ""}${b.status ? ` [recorded flag: ${b.status}]` : " [status unclassified]"} (measured: ${b.test_date || "date unknown"})`).join("; ") + ".")
    }
    // Their questionnaire answers (freshly fetched so generation always reflects the latest)
    const { data: ik, error: intakeError } = await supabase.from("intake_responses").select("*")
      .eq("user_id", user.id).eq("completed", true).order("completed_at", { ascending: false }).limit(1).maybeSingle()
    if (intakeError) throw new Error("Your questionnaire could not be loaded. Please try again.")
    if (ik) {
      const ip: string[] = []
      if (ik.primary_goal) ip.push(`main goal is ${ik.primary_goal}`)
      if (ik.chief_complaint) ip.push(`top concern: "${ik.chief_complaint}"`)
      if (ik.sleep_hours != null) ip.push(`sleeps ${ik.sleep_hours} h/night`)
      if (ik.exercise_days != null) ip.push(`exercises ${ik.exercise_days} days/week`)
      if (ik.stress_level != null) ip.push(`stress ${ik.stress_level}/10`)
      if (ik.diet_description) ip.push(`diet: ${ik.diet_description}`)
      if (ik.nicotine) ip.push(`nicotine: ${ik.nicotine}`)
      if (ik.supplement_willingness) ip.push(`supplement openness: ${ik.supplement_willingness}`)
      if (ip.length) lines.push(`From their questionnaire (${ik.completed_at || "date unknown"}) — ` + ip.join("; ") + ".")
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Sign in again to generate your draft.")
      const res = await fetch("/api/protocol/generate", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ healthSummary: summary }),
      })
      const gen = await res.json()
      if (!res.ok) throw new Error(gen.error || "Generation failed")

      setDraft(gen)
      setSelectedActions(new Set())
    } catch (e: any) {
      setError(e?.message || "Something went wrong generating your protocol.")
    } finally {
      setGenerating(false)
    }
  }

  async function saveDraft() {
    if (!user || !draft || saving || !selectedActions.size) return
    setSaving(true); setError(null)
    let newId: string | null = null
    let activated = false
    try {
      const chosen = draft.tasks.filter((_: any, i: number) => selectedActions.has(i))
      // Stage using a known schema status. Preserve the current active plan until
      // every selected action has been saved successfully.
      const { data: proto, error: pErr } = await supabase.from("protocols").insert({
        user_id: user.id, phase: "baseline", health_score: null, health_score_target: null,
        plain_summary: draft.plain_summary, issues_ranked: [], interventions: chosen,
        report: draft.report, retest_date: null, full_retest_date: null, status: "archived",
      }).select().single()
      if (pErr || !proto) throw new Error("Could not save your plan. Your previous plan is unchanged.")
      newId = proto.id
      const { error: tErr } = await supabase.from("protocol_tasks").insert(chosen.map((t: any, i: number) => ({
        user_id: user.id, protocol_id: proto.id, task_name: t.task_name, description: t.description,
        why_it_matters: t.why_it_matters, category: t.category, frequency: t.frequency,
        priority: t.priority, evidence_level: null, cost_estimate: null, sort_order: i,
        kanban_status: "todo", is_recurring: true,
      })))
      if (tErr) throw new Error("Could not save the selected actions. Your previous plan is unchanged.")
      const { data: activatedPlan, error: aErr } = await supabase.from("protocols").update({ status: "active" }).eq("id", proto.id).eq("user_id", user.id).select("id").single()
      if (aErr || !activatedPlan) throw new Error("Could not activate your plan. Your previous plan is unchanged.")
      activated = true
      if (protocol?.id) {
        const { error: archiveError } = await supabase.from("protocols").update({ status: "archived" }).eq("id", protocol.id).eq("user_id", user.id)
        if (archiveError) setError("Your new plan is saved. The previous plan could not be archived; refresh before making more changes.")
      }
      setDraft(null)
      await load()
    } catch (e: any) {
      setError(e?.message || "Could not save your plan.")
      if (newId && !activated) await supabase.from("protocols").delete().eq("id", newId).eq("user_id", user.id)
    } finally { setSaving(false) }
  }

  async function toggleDay(task: any, dateStr: string) {
    if (!user) return
    const key = `${task.id}|${dateStr}`
    if (pendingUpdates.current.has(key)) return
    pendingUpdates.current.add(key)
    const has = done.has(key)
    try {
      const result = has
        ? await supabase.from("task_completions").delete().eq("user_id", user.id).eq("task_id", task.id).eq("completed_date", dateStr)
        : await supabase.from("task_completions").insert({ user_id: user.id, task_id: task.id, completed_date: dateStr })
      if (result.error) throw result.error
      setDone(previous => { const next = new Set(previous); has ? next.delete(key) : next.add(key); return next })
      if (dateStr === todayStr()) setDoneToday(previous => { const next = new Set(previous); has ? next.delete(task.id) : next.add(task.id); return next })
    } catch { setError("That completion could not be saved. Please try again.") }
    finally { pendingUpdates.current.delete(key) }
  }

  async function moveTask(taskId: string, status: string) {
    if (!user || pendingUpdates.current.has(taskId)) return
    pendingUpdates.current.add(taskId)
    try {
      const { data, error } = await supabase.from("protocol_tasks").update({ kanban_status: status }).eq("id", taskId).eq("user_id", user.id).select("id").single()
      if (error || !data) throw error
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, kanban_status: status } : t))
    } catch { setError("That action could not be moved. Please try again.") }
    finally { pendingUpdates.current.delete(taskId) }
  }

  const completedCount = doneToday.size
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0

  const VIEWS: { key: View; label: string; icon: any }[] = [
    { key: "list", label: "List", icon: List },
    { key: "board", label: "Board", icon: LayoutGrid },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
  ]

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 pb-24 md:pb-12">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Your protocol</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Turn your health context into a focused, trackable routine.</p>
          </div>
          {protocol && (
            <button onClick={() => setIntakeOpen(true)} disabled={generating || saving}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Create a new draft
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4">Creating a draft sends your questionnaire and a summary of your health records to our AI provider. Review suggestions before saving; your existing plan stays available.</p>
        {error && (
          <div className="mb-4 rounded-xl border border-health-danger/30 bg-health-danger/10 px-4 py-3 text-sm text-health-danger">{error}</div>
        )}

        {draft && (
          <section aria-label="Review your draft protocol" className="health-panel p-6 mb-6 border-primary/30">
            <p className="eyebrow text-primary">Your choice comes first</p>
            <h2 className="text-xl font-semibold mt-2">Choose the actions you want to try</h2>
            <p className="text-sm text-muted-foreground mt-2">{draft.plain_summary}</p>
            <p className="text-xs text-muted-foreground mt-3">AI-generated suggestions, not independently verified. Select what fits your goals and circumstances. Saving replaces your active plan; unselected actions are left out.</p>
            <div className="space-y-3 my-5">{draft.tasks.map((task: any, i: number) => (
              <label key={i} className="flex items-start gap-3 rounded-xl border border-border p-4 cursor-pointer hover:bg-secondary/50">
                <input type="checkbox" disabled={saving} checked={selectedActions.has(i)} onChange={() => setSelectedActions(previous => { const next = new Set(previous); next.has(i) ? next.delete(i) : next.add(i); return next })} className="mt-1 accent-primary" />
                <span><span className="block text-sm font-semibold">{task.task_name}</span><span className="block text-xs text-muted-foreground mt-1">{task.description}</span><span className="block text-xs text-primary mt-2">Based on: {task.why_it_matters}</span><a href={`/insights?q=${encodeURIComponent(task.task_name)}`} className="inline-block text-xs underline mt-2">Explore the research</a></span>
              </label>
            ))}</div>
            <div className="flex gap-3 flex-wrap"><button onClick={saveDraft} disabled={saving || !selectedActions.size} className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold disabled:opacity-40">{saving ? "Saving…" : `Save ${selectedActions.size} selected actions`}</button><button onClick={() => setDraft(null)} disabled={saving} className="text-sm px-3 py-2">Discard draft</button></div>
          </section>
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
              Healyx reads your profile, conditions, medications, and labs, then gives you a short, prioritized plan. Log your actions and revisit your measurements to see what changes.
            </p>
            <button onClick={() => setIntakeOpen(true)} disabled={generating || saving}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : <><Sparkles className="h-4 w-4" /> Start your questionnaire</>}
            </button>
            <p className="mt-4 text-[11px] text-muted-foreground/70 max-w-sm mx-auto">
              Generating a draft shares a summary of your questionnaire, conditions, medications, and recent labs with our AI provider. You choose which suggestions to save.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">From understanding to action</p>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3">Small steps. A plan you can follow.</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{protocol.plain_summary || "Your personalized protocol is ready. Start with one action and keep a record of what changes."}</p>
              <div className="grid sm:grid-cols-3 gap-3 mt-6">
                <div className="rounded-2xl border border-border bg-background/60 p-4"><p className="text-xs text-muted-foreground mb-2">Actions logged today</p><p className="text-2xl font-semibold">{completedCount}<span className="text-base text-muted-foreground"> / {tasks.length}</span></p><div role="progressbar" aria-label="Actions logged today completion" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div><p className="text-xs text-muted-foreground mt-2">Actions logged, not a health score</p></div>
                <div className="rounded-2xl border border-border bg-background/60 p-4"><p className="text-xs text-muted-foreground mb-2">Your next action</p><p className="text-sm font-semibold leading-relaxed">{tasks.find(t => !done.has(`${t.id}|${todayStr()}`))?.task_name || (tasks.length ? "All actions logged today" : "No actions in this plan yet")}</p><a href="#protocol-actions" className="inline-block text-xs font-semibold text-primary mt-3">View your actions →</a></div>
                <div className="rounded-2xl border border-border bg-background/60 p-4"><p className="text-xs text-muted-foreground mb-2">Review your progress</p><p className="text-sm font-semibold">When your context changes</p><p className="text-xs text-muted-foreground leading-relaxed mt-2">Compare new measurements and discuss changes before updating your plan.</p></div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-4">AI-generated context, not independently verified. Actions are suggestions you can choose to try. Tracking completion does not establish a health benefit.</p>
            {/* Here's what's going on */}
            {protocol.report?.whats_going_on && (
              <div className="mb-4">
                <h2 className="text-sm font-medium text-foreground mb-1.5">Here&apos;s what&apos;s going on</h2>
                <p className="text-sm text-foreground/90 leading-relaxed">{protocol.report.whats_going_on}</p>
              </div>
            )}

            {/* What's working */}
            {Array.isArray(protocol.report?.strengths) && protocol.report.strengths.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">What&apos;s working</p>
                <div className="space-y-1.5">
                  {protocol.report.strengths.map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                      <Check className="h-4 w-4 text-health-optimal mt-0.5 shrink-0" />{s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What to focus on (concerns + research) */}
            {Array.isArray(protocol.report?.concerns) && protocol.report.concerns.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">What to focus on</p>
                <div className="space-y-2.5">
                  {protocol.report.concerns.map((c: any, i: number) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-3.5">
                      <p className="text-sm font-medium text-foreground">{c.label}</p>
                      {c.plain && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.plain}</p>}
                      <a className="inline-block text-xs text-primary underline underline-offset-2 mt-2" href={`/insights?q=${encodeURIComponent(c.label || "health")}`}>Explore original sources</a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What this is based on */}
            <div className="rounded-xl border border-border bg-card mb-4 overflow-hidden">
              <button onClick={() => setBasedOnOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-foreground">What this is based on</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${basedOnOpen ? "rotate-180" : ""}`} />
              </button>
              {basedOnOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {Array.isArray(protocol.issues_ranked) && protocol.issues_ranked.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Generated topics to review</p>
                      <ul className="space-y-1">
                        {protocol.issues_ranked.map((it: any, i: number) => (
                          <li key={i} className="text-xs text-foreground/90">
                            <span className="font-medium capitalize">{it.issue}</span>

                            {it.why && <span className="text-muted-foreground"> — {it.why}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {protocol.report?.input_summary && <div><p className="text-xs font-semibold mb-2">Recorded context used for this draft</p><pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">{protocol.report.input_summary}</pre></div>}
                  {intake ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your questionnaire</p>
                        <button onClick={() => setIntakeOpen(true)} className="text-xs text-primary hover:opacity-80">Update</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {intake.primary_goal && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Goal: {intake.primary_goal}</span>}
                        {intake.sleep_hours != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Sleep: {intake.sleep_hours}h</span>}
                        {intake.exercise_days != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Exercise: {intake.exercise_days}d/wk</span>}
                        {intake.stress_level != null && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Stress: {intake.stress_level}/10</span>}
                        {intake.diet_description && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{intake.diet_description}</span>}
                        {intake.nicotine && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Nicotine: {intake.nicotine}</span>}
                      </div>
                      {intake.chief_complaint && <p className="text-xs text-muted-foreground mt-2">&ldquo;{intake.chief_complaint}&rdquo;</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No questionnaire on file. <button onClick={() => setIntakeOpen(true)} className="text-primary hover:opacity-80">Fill it out</button> for a more tailored plan.</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">Built from your questionnaire, conditions, medications, and recent labs.</p>
                </div>
              )}
            </div>

            {/* Your chosen routine */}
            <div className="mb-3">
              <h2 className="text-sm font-medium text-foreground">Your chosen routine</h2>
              {protocol.report?.four_week_focus && (
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{protocol.report.four_week_focus}</p>
              )}
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
              <span id="protocol-actions" className="scroll-mt-24" />
              {view === "list" && <p className="text-xs text-muted-foreground">{completedCount}/{tasks.length} logged today · {pct}%</p>}
            </div>

            {/* ───────── LIST ───────── */}
            {view === "list" && (
              <>
                <div className="h-1.5 w-full rounded-full bg-secondary mb-4 overflow-hidden">
                  <div className="h-full rounded-full bg-health-optimal transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="space-y-2.5">
                  {tasks.map((t) => {
                    const isDone = doneToday.has(t.id)
                    const cfg = CAT[t.category] || CAT.tracking
                    const Icon = cfg.icon
                    return (
                      <div key={t.id}
                        className={`rounded-xl border p-3.5 transition-colors ${isDone ? "border-health-optimal/30 bg-health-optimal/[0.05]" : "border-border bg-card"}`}>
                        <div className="flex items-start gap-3">
                          <button onClick={() => toggleDay(t, todayStr())} aria-label={isDone ? "Mark not done" : "Mark done"}
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${isDone ? "bg-health-optimal border-health-optimal text-background" : "border-border hover:border-primary"}`}>
                            {isDone && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.task_name}</span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                                <Icon className="h-3 w-3" />{cfg.label}
                              </span>
                              {t.frequency && <span className="text-[10px] text-muted-foreground/70">{t.frequency}</span>}
                            </div>
                            {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                            {t.why_it_matters && <p className="text-xs text-primary/80 mt-1">Why: {t.why_it_matters}</p>}
                            <div className="flex items-center gap-2 mt-1.5">
                              <a href={`/insights?q=${encodeURIComponent(t.task_name)}`} className="text-[11px] text-primary underline underline-offset-2">Explore supporting research</a>
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
                              onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                              className="rounded-lg border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing">
                              <div className="flex items-start gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                <span className="text-xs font-medium text-foreground leading-snug">{t.task_name}</span>
                              </div>
                              {t.frequency && <p className="text-[10px] text-muted-foreground mt-1 ml-5">{t.frequency}</p>}
                              <div className="flex items-center justify-end gap-1 mt-1.5">
                                {ci > 0 && <button onClick={() => moveTask(t.id, KANBAN[ci - 1].key)} aria-label="Move left" className="text-muted-foreground hover:text-primary"><ChevronLeft className="h-3.5 w-3.5" /></button>}
                                {ci < KANBAN.length - 1 && <button onClick={() => moveTask(t.id, KANBAN[ci + 1].key)} aria-label="Move right" className="text-muted-foreground hover:text-primary"><ChevronRight className="h-3.5 w-3.5" /></button>}
                              </div>
                            </div>
                          )
                        })}
                        {colTasks.length === 0 && <p className="text-[10px] text-muted-foreground/50 text-center py-3">Drop tasks here</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ───────── CALENDAR ───────── */}
            {view === "calendar" && (
              <>
                <div className="inline-flex rounded-full border border-border bg-card p-1 mb-4">
                  {(["month", "week"] as const).map(m => (
                    <button key={m} onClick={() => setCalMode(m)}
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${calMode === m ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{m}</button>
                  ))}
                </div>

                {calMode === "month" ? (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-3 text-center">
                      {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} className="text-center text-[10px] text-muted-foreground py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {monthGrid.days.map((d) => {
                        const ds = fmt(d)
                        const inMonth = d.getMonth() === monthGrid.month
                        const isToday = ds === todayStr()
                        const dc = tasks.filter(t => done.has(`${t.id}|${ds}`)).length
                        const ratio = tasks.length ? dc / tasks.length : 0
                        return (
                          <div key={ds}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-center ${isToday ? "border border-primary" : "border border-transparent"} ${inMonth ? "" : "opacity-30"}`}
                            style={{ background: ratio > 0 ? `color-mix(in oklch, var(--health-optimal) ${Math.round(ratio * 65)}%, transparent)` : "transparent" }}>
                            <span className={`text-xs ${inMonth ? "text-foreground" : "text-muted-foreground"}`}>{d.getDate()}</span>
                            {dc > 0 && <span className="text-[8px] text-health-optimal leading-none mt-0.5">{dc}/{tasks.length}</span>}
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground/70 text-center">Shaded days = tasks completed. Switch to Week to check things off.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {week.map((d) => {
                      const ds = fmt(d)
                      const isToday = ds === todayStr()
                      const isFuture = d.getTime() > new Date().setHours(23, 59, 59, 999)
                      const doneCount = tasks.filter(t => done.has(`${t.id}|${ds}`)).length
                      return (
                        <div key={ds} className={`rounded-xl border p-3.5 ${isToday ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-card"}`}>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${isToday ? "text-primary" : "text-foreground"}`}>
                                {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
                              </span>
                              {isToday && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">Today</span>}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{doneCount}/{tasks.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {tasks.map(t => {
                              const isDone = done.has(`${t.id}|${ds}`)
                              const cfg = CAT[t.category] || CAT.tracking
                              const Icon = cfg.icon
                              return (
                                <button key={t.id} onClick={() => !isFuture && toggleDay(t, ds)} disabled={isFuture} title={t.task_name}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${isDone ? "border-health-optimal/40 bg-health-optimal/15 text-health-optimal" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                                  {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
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
              </>
            )}

            {/* Review, learn, adjust */}
            <div className="mt-6 rounded-xl border border-border bg-card/60 p-4">
              <p className="text-sm font-medium text-foreground mb-1">Review, learn, adjust</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Review what you tried and what you noticed. Update your routine when your goals or records change. Agree any medical testing interval with your clinician.
              </p>
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground/70 text-center">
              Educational wellness guidance, not medical advice.
            </p>
          </>
        )}
      </div>

      {intakeOpen && (
        <ProtocolIntake
          existing={intake}
          onClose={() => setIntakeOpen(false)}
          onSaved={async () => { setIntakeOpen(false); await load(); await generate() }}
        />
      )}
    </div>
  )
}
