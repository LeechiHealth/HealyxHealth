"use client"

import * as React from "react"
import {
  ArrowUp, BellRing, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, Loader2, Mic,
  PanelRight, CalendarPlus, Pill, Plug, Plus, Search, ShoppingBag, Square, X, type LucideIcon,
} from "lucide-react"
import { Header } from "@/components/header"
import { useAuth } from "@/components/AuthContext"
import { TaskCard, summaryLine } from "@/components/agents/task-card"
import { AgentAvatar, AGENT_ACCENTS } from "@/components/agents/agent-avatar"
import { useVoiceInput } from "@/hooks/useVoiceInput"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AGENTS, AGENT_IDS, CONNECTIONS, agentById, type AgentId } from "@/lib/agents/config"
import { formatClock, formatLocalDate, formatLocalDateTime, localNow } from "@/lib/agents/dates"
import type { AgentMessage, AgentTask, MessageMeta, TaskKind, TaskStatus } from "@/lib/agents/tasks"

type LiveStep = { id: string; label: string; status: "running" | "done" | "error" }

type ThreadMessage = AgentMessage & { urgent?: "emergency" | "crisis"; taskIds?: string[] }
type Threads = Record<AgentId, ThreadMessage[]>
type Storage = "loading" | "ready" | "missing" | "error"
type QueueFilter = "todo" | "waiting" | "done"
type MobileView = "list" | "chat" | "panel"

const emptyThreads = (): Threads => ({ appointments: [], medications: [], research: [], shopping: [] })
const isMissingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message || "")))

const KIND: Record<TaskKind, { icon: LucideIcon; label: string }> = {
  appointment: { icon: CalendarClock, label: "Visit" },
  med_reminder: { icon: BellRing, label: "Reminder" },
  refill_request: { icon: Pill, label: "Refill request" },
  research_brief: { icon: FileText, label: "Research brief" },
  shopping_list: { icon: ShoppingBag, label: "Shopping list" },
}

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: "todo", label: "Needs you" },
  { key: "waiting", label: "Waiting" },
  { key: "done", label: "Done" },
]

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "7:34 PM" today, "Yesterday", a weekday within the week, otherwise "Nov 2". */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  if (sameDay(date, now)) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return "Yesterday"
  if (now.getTime() - date.getTime() < 6 * 86_400_000) return date.toLocaleDateString("en-US", { weekday: "long" })
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatStamp(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (sameDay(date, new Date())) return time
  return `${date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}`
}

interface Routine { id: string; taskId: string; title: string; schedule: string; on: boolean; status: string }

/** Reminders the person can put on their calendar. "On" only when they confirmed adding it. */
function routinesFor(tasks: AgentTask[]): Routine[] {
  const routines: Routine[] = []
  for (const task of tasks) {
    const p = task.payload
    if (task.kind === "med_reminder") {
      const days: string[] = p.days || []
      routines.push({
        id: task.id, taskId: task.id, title: task.title,
        schedule: `${days.length && days.length < 7 ? days.join(", ") : "Every day"} at ${(p.times || []).map(formatClock).join(", ")}`,
        on: task.status === "done", status: task.status === "done" ? "On your calendar" : "Not added yet · tap to add",
      })
    } else if (task.kind === "appointment" && p.starts_at) {
      routines.push({ id: task.id, taskId: task.id, title: task.title, schedule: `${formatLocalDateTime(p.starts_at)} · alerts 1 day and 1 hour before`, on: false, status: "Not added yet · tap to add" })
    } else if (task.kind === "refill_request" && p.remind_on) {
      routines.push({ id: task.id, taskId: task.id, title: `Request refill: ${p.medication}`, schedule: `${formatLocalDate(p.remind_on)} at 9:00 AM`, on: false, status: "Not added yet · tap to add" })
    }
  }
  return routines
}

const seconds = (ms?: number) => `${Math.max(1, Math.round((ms || 0) / 1000))}s`

/** What the agent did: live while it works, then a collapsible "Worked for 42s" summary. */
function WorkLog({ steps, durationMs, live }: { steps: { label: string; status: string }[]; durationMs?: number; live?: boolean }) {
  const [open, setOpen] = React.useState(Boolean(live))
  if (!steps.length && !live) return null
  return (
    <div className="max-w-[85%]">
      <button type="button" onClick={() => setOpen(o => !o)} disabled={live} aria-expanded={open || live}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground">
        {live ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
        {live ? `Working${durationMs ? ` for ${seconds(durationMs)}` : ""}` : `Worked for ${seconds(durationMs)}`}
        {steps.length > 0 && <span>· {steps.length} {steps.length === 1 ? "step" : "steps"}</span>}
        {!live && steps.length > 0 && <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />}
      </button>
      {(open || live) && steps.length > 0 && (
        <ol className="mt-2 space-y-1.5 border-l border-border pl-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              {step.status === "running" ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                : step.status === "error" ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-health-warning" />
                : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-health-normal" />}
              <span className={step.status === "running" ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function SourceChips({ sources }: { sources?: { title: string; url: string }[] }) {
  if (!sources?.length) return null
  return (
    <div className="flex max-w-[85%] flex-wrap gap-1.5">
      {sources.map(source => {
        let host = source.title
        try { if (!/\./.test(host)) host = new URL(source.url).hostname.replace(/^www\./, "") } catch { /* keep title */ }
        return (
          <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40">
            {host}<ExternalLink className="h-3 w-3" />
          </a>
        )
      })}
    </div>
  )
}

function ConnectionsList() {
  return (
    <ul className="space-y-3">
      {CONNECTIONS.map(c => (
        <li key={c.name} className="text-xs">
          <span className="flex items-center justify-between gap-3">
            <span className="font-semibold text-foreground">{c.name}</span>
            <span className={cn("shrink-0 text-[10px] font-semibold", c.status === "works" ? "text-health-normal" : "text-muted-foreground")}>{c.status === "works" ? "Works now" : c.status === "coming" ? "Coming next" : "Not connected"}</span>
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{c.detail}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AgentsPage() {
  const { user } = useAuth()
  const [active, setActive] = React.useState<AgentId>("appointments")
  const [threads, setThreads] = React.useState<Threads>(emptyThreads)
  const [tasks, setTasks] = React.useState<AgentTask[]>([])
  const [storage, setStorage] = React.useState<Storage>("loading")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [mobileSearch, setMobileSearch] = React.useState(false)
  const [view, setView] = React.useState<MobileView>("list")
  const [panelOpen, setPanelOpen] = React.useState(true)
  const [filter, setFilter] = React.useState<QueueFilter>("todo")
  const [focusTaskId, setFocusTaskId] = React.useState<string | null>(null)
  const [showStarters, setShowStarters] = React.useState(false)
  const [showConnections, setShowConnections] = React.useState(false)
  const [liveSteps, setLiveSteps] = React.useState<LiveStep[]>([])
  const [runStarted, setRunStarted] = React.useState(0)
  const [, setTick] = React.useState(0)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const voice = useVoiceInput(text => { setDraft(prev => (prev.trim() ? `${prev.trim()} ${text}` : text)); inputRef.current?.focus() })

  const agent = agentById(active)!
  const thread = threads[active]
  const visibleTasks = tasks.filter(task => task.status !== "dismissed")
  const agentTasks = visibleTasks.filter(task => task.agent === active)
  const counts = (list: AgentTask[]) => ({
    todo: list.filter(t => t.status === "todo").length,
    waiting: list.filter(t => t.status === "waiting").length,
    done: list.filter(t => t.status === "done").length,
  })
  const agentCounts = counts(agentTasks)
  const needsYou = visibleTasks.filter(task => task.status === "todo")
  const displayName = (user?.user_metadata?.full_name || user?.user_metadata?.first_name || user?.email?.split("@")[0] || "You") as string
  const initials = displayName.split(/[\s.]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "Y"

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const [messages, saved] = await Promise.all([
        supabase.from("agent_messages").select("id, agent, role, content, created_at, meta").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
          .then(result => result.error && /column|meta/i.test(result.error.message || "")
            ? supabase.from("agent_messages").select("id, agent, role, content, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
            : result),
        supabase.from("agent_tasks").select("*").eq("user_id", user.id).neq("status", "dismissed").order("created_at", { ascending: false }).limit(100),
      ])
      if (cancelled) return
      if (isMissingTable(messages.error) || isMissingTable(saved.error)) { setStorage("missing"); return }
      if (messages.error || saved.error) { setStorage("error"); return }
      const grouped = emptyThreads()
      for (const message of [...(messages.data || [])].reverse() as AgentMessage[]) grouped[message.agent]?.push(message)
      setThreads(grouped)
      setTasks((saved.data || []) as AgentTask[])
      setStorage("ready")
    })()
    return () => { cancelled = true }
  }, [user])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [thread.length, sending, active, view, liveSteps.length])

  React.useEffect(() => {
    if (!sending) return
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [sending])

  React.useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft, view, active])

  // Attach each task to the reply that created it, including history loaded from the database.
  const tasksByMessage = React.useMemo(() => {
    const map = new Map<string, AgentTask[]>()
    for (const agentId of AGENT_IDS) {
      const replies = threads[agentId].filter(m => m.role === "assistant")
      for (const task of visibleTasks.filter(t => t.agent === agentId)) {
        let target = replies.find(m => m.taskIds?.includes(task.id))
        if (!target) {
          const created = Date.parse(task.created_at)
          target = [...replies].reverse().find(m => { const gap = created - Date.parse(m.created_at); return gap >= -5_000 && gap <= 120_000 })
        }
        if (target) map.set(target.id, [...(map.get(target.id) || []), task])
      }
    }
    return map
  }, [threads, visibleTasks])

  const lastMessage = (id: AgentId) => threads[id][threads[id].length - 1]
  const matches = (text: string) => !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase())
  const agentList = AGENTS.filter(a => matches(`${a.name} ${a.tagline}`))

  async function send(text: string) {
    const message = text.trim()
    if (!message || sending || !user) return
    const agentId = active
    const history = threads[agentId].filter(m => !m.urgent).slice(-10).map(({ role, content }) => ({ role, content }))
    const pending: ThreadMessage = { id: `pending-${Date.now()}`, agent: agentId, role: "user", content: message, created_at: new Date().toISOString() }
    setSending(true); setError(null); setDraft(""); setShowStarters(false); voice.clearError()
    setThreads(prev => ({ ...prev, [agentId]: [...prev[agentId], pending] }))
    setLiveSteps([]); setRunStarted(Date.now())
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Sign in again to use agents.")
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ agent: agentId, message, history, now: localNow(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: new Date().getTimezoneOffset() }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || "The agent couldn't respond. Please try again.")
      }
      // Steps stream in as newline-delimited JSON; a crisis reply comes back as plain JSON.
      let body: any = null
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        body = await response.json()
      } else if (response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let newline: number
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line) continue
            let event: any
            try { event = JSON.parse(line) } catch { continue }
            if (event.type === "step") {
              setLiveSteps(prev => (prev.some(step => step.id === event.step.id) ? prev.map(step => (step.id === event.step.id ? event.step : step)) : [...prev, event.step]))
            } else if (event.type === "done") {
              body = event
            } else if (event.type === "error") {
              throw new Error(event.error || "The agent couldn't finish. Please try again.")
            }
          }
        }
      }
      if (!body) throw new Error("The agent stopped before finishing. Please try again.")
      const created: AgentTask[] = Array.isArray(body.tasks) ? body.tasks : []
      const reply: ThreadMessage = { id: `reply-${Date.now()}`, agent: agentId, role: "assistant", content: body.reply, created_at: new Date().toISOString(), urgent: body.urgent || undefined, taskIds: created.map(task => task.id), meta: body.meta as MessageMeta | undefined }
      setThreads(prev => ({ ...prev, [agentId]: [...prev[agentId], reply] }))
      if (created.length) {
        setTasks(prev => [...created, ...prev])
        setFilter("todo")
        setFocusTaskId(created[0].id)
      }
      const updates: { id: string; status: TaskStatus }[] = Array.isArray(body.updates) ? body.updates : []
      if (updates.length) setTasks(prev => prev.map(task => { const update = updates.find(u => u.id === task.id); return update ? { ...task, status: update.status } : task }))
      if (body.persisted === false && !body.urgent && storage === "ready") setStorage("error")
    } catch (e: unknown) {
      setThreads(prev => ({ ...prev, [agentId]: prev[agentId].filter(m => m.id !== pending.id) }))
      setDraft(message)
      setError(e instanceof Error ? e.message : "The agent couldn't respond. Please try again.")
    } finally {
      setSending(false)
      setLiveSteps([])
    }
  }

  async function updateTask(task: AgentTask, patch: Partial<Pick<AgentTask, "status" | "payload" | "due_at">>) {
    if (!user) return
    const before = tasks
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...patch } : t)))
    if (task.local) return
    const { error: saveError } = await supabase.from("agent_tasks").update(patch).eq("id", task.id).eq("user_id", user.id)
    if (saveError) { setTasks(before); setError("That change couldn't be saved. Please try again.") }
  }

  function openAgent(id: AgentId) {
    setActive(id); setError(null); setShowStarters(false); setView("chat"); setFocusTaskId(null)
  }

  function openTask(task: AgentTask) {
    setActive(task.agent)
    setFilter(task.status === "done" ? "done" : task.status === "waiting" ? "waiting" : "todo")
    setFocusTaskId(task.id)
    setPanelOpen(true)
    setView("panel")
  }

  function togglePanel() {
    if (view === "panel") { setView("chat"); return }
    setPanelOpen(open => !open)
    setView("panel")
  }

  const queue = agentTasks.filter(task => task.status === filter)
  const routines = routinesFor(agentTasks)

  // ─── Panes ────────────────────────────────────────────────────────────────

  const sidebar = (
    <aside aria-label="Agents" className="hidden lg:flex w-[300px] shrink-0 flex-col border-r border-border">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
          {storage === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm text-muted-foreground focus-within:ring-1 focus-within:ring-primary/40">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search agents" className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </label>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {agentList.map(a => {
          const last = lastMessage(a.id)
          const open = visibleTasks.filter(t => t.agent === a.id && t.status === "todo").length
          const selected = a.id === active
          return (
            <button key={a.id} type="button" onClick={() => openAgent(a.id)} aria-current={selected ? "page" : undefined}
              className={cn("w-full flex items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors", selected ? "bg-secondary" : "hover:bg-secondary/50")}>
              <AgentAvatar agent={a.id} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold text-foreground truncate">{a.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{last ? formatWhen(last.created_at) : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground truncate flex-1">{last ? last.content.replace(/\s+/g, " ") : a.intro}</span>
                  {open > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label={`${open} need you`} />}
                </span>
              </span>
            </button>
          )
        })}
        {agentList.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No agents match &ldquo;{query}&rdquo;.</p>}
      </nav>
      <div className="relative border-t border-border px-2 py-2 space-y-0.5">
        {showConnections && (
          <div className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="eyebrow mb-3">Connections</p>
            <ConnectionsList />
          </div>
        )}
        <button type="button" onClick={() => setShowConnections(s => !s)} aria-expanded={showConnections} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/60">
          <Plug className="h-4 w-4 text-muted-foreground" />Connections
        </button>
        <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{initials}</span>
          <span className="truncate">{displayName}</span>
        </div>
      </div>
    </aside>
  )

  const mobileHome = (
    <section aria-label="Agents" className={cn("lg:hidden flex-1 flex-col overflow-y-auto", view === "list" ? "flex" : "hidden")}>
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Search" onClick={() => setMobileSearch(s => !s)} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/70"><Search className="h-4 w-4" /></button>
          <button type="button" aria-label="Connections" onClick={() => setShowConnections(true)} className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/70"><Plug className="h-4 w-4" /></button>
        </div>
      </div>
      {mobileSearch && (
        <label className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents and tasks" className="w-full bg-transparent focus:outline-none" />
        </label>
      )}
      <div className="grid grid-cols-4 gap-2 px-3 pt-5 pb-4">
        {agentList.map(a => {
          const open = visibleTasks.filter(t => t.agent === a.id && t.status === "todo").length
          return (
            <button key={a.id} type="button" onClick={() => openAgent(a.id)} className="relative flex flex-col items-center gap-1.5">
              <AgentAvatar agent={a.id} size={60} />
              {open > 0 && <span className="absolute right-2 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{open}</span>}
              <span className="text-[12px] text-muted-foreground">{a.name}</span>
            </button>
          )
        })}
      </div>
      <div className="px-2 pb-6">
        {needsYou.filter(t => matches(`${t.title} ${agentById(t.agent)?.name}`)).length === 0 ? (
          <div className="mx-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-medium">Nothing needs you right now.</p>
            <p className="text-xs text-muted-foreground mt-1">Tap an agent to start. Drafts and reminders show up here.</p>
          </div>
        ) : needsYou.filter(t => matches(`${t.title} ${agentById(t.agent)?.name}`)).map(task => (
          <button key={task.id} type="button" onClick={() => openTask(task)} className="w-full flex items-center gap-3 rounded-2xl px-2.5 py-3 text-left active:bg-secondary/60">
            <AgentAvatar agent={task.agent} size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold truncate">{task.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(task.created_at)}</span>
              </span>
              <span className="block text-[13px] text-muted-foreground truncate">{agentById(task.agent)?.name} · {summaryLine(task) || KIND[task.kind].label}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="px-6 pb-8 text-center text-[11px] text-muted-foreground">Agents prepare drafts and reminders. Nothing is sent, booked or bought for you.</p>
    </section>
  )

  let lastStamp = 0
  const chat = (
    <section aria-label={`${agent.name} agent`} className={cn("min-w-0 flex-1 flex-col", view === "chat" ? "flex" : "hidden", "lg:flex")}>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3 sm:px-4">
        <button type="button" onClick={() => setView("list")} aria-label="Back to agents" className="lg:hidden -ml-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
        <AgentAvatar agent={active} size={30} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{agent.name}</h2>
          <p className="text-[11px] text-muted-foreground truncate">{agent.tagline}</p>
        </div>
        <button type="button" onClick={togglePanel} aria-label="Show queue and routines" aria-pressed={panelOpen}
          className={cn("ml-auto relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground", panelOpen && "lg:bg-secondary lg:text-foreground")}>
          <PanelRight className="h-[18px] w-[18px]" />
          {agentCounts.todo > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{agentCounts.todo}</span>}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-5">
        {(storage === "missing" || storage === "error") && (
          <p className="mx-auto mb-4 max-w-md rounded-xl bg-health-warning/10 px-3 py-2 text-center text-[11px] text-foreground">
            {storage === "missing" ? "Saving isn't set up yet, so this conversation and its tasks only last until you leave." : "Some history couldn't be loaded or saved. Tasks marked \"Not saved\" disappear when you leave."}
          </p>
        )}
        <div className="mx-auto max-w-2xl space-y-2.5">
          {/* Each agent opens by introducing itself and how to use it. */}
          <div className="space-y-2.5 pb-1">
            <div className="flex items-end gap-2">
              <AgentAvatar agent={active} size={28} className="mb-0.5" />
              <p className="max-w-[80%] rounded-[1.35rem] rounded-bl-md bg-secondary px-4 py-2.5 text-[15px] leading-snug text-foreground">
                {agent.intro}
                <span className="mt-1.5 block font-semibold">{agent.howTo}</span>
              </p>
            </div>
            {thread.length === 0 && !sending && (
              <div className="flex flex-wrap gap-2 pl-9">
                {agent.starters.map(starter => (
                  <button key={starter} type="button" onClick={() => send(starter)} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] text-foreground hover:border-primary/40 hover:bg-secondary/50 transition-colors">{starter}</button>
                ))}
              </div>
            )}
          </div>
          {thread.map(message => {
            const time = Date.parse(message.created_at)
            const showStamp = !lastStamp || time - lastStamp > 30 * 60_000
            lastStamp = time
            const attached = message.role === "assistant" ? tasksByMessage.get(message.id) || [] : []
            return (
              <React.Fragment key={message.id}>
                {showStamp && <p className="pt-2 pb-1 text-center text-xs text-muted-foreground">{formatStamp(message.created_at)}</p>}
                {message.role === "user" ? (
                  <div className="flex justify-end">
                    <p className="max-w-[80%] rounded-[1.35rem] bg-foreground px-4 py-2.5 text-[15px] leading-snug text-background whitespace-pre-wrap">{message.content}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {message.meta?.steps && <WorkLog steps={message.meta.steps} durationMs={message.meta.duration_ms} />}
                    <p className={cn("max-w-[85%] w-fit rounded-[1.35rem] px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap", message.urgent ? "border border-health-danger/50 bg-health-danger/10 font-medium" : "bg-secondary text-foreground")}>{message.content}</p>
                    <SourceChips sources={message.meta?.sources} />
                    {attached.map(task => {
                      const Icon = KIND[task.kind].icon
                      return (
                        <button key={task.id} type="button" onClick={() => openTask(task)} className="flex w-full max-w-[360px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left shadow-sm hover:border-primary/40 transition-colors">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklch, ${AGENT_ACCENTS[task.agent]} 14%, transparent)`, color: AGENT_ACCENTS[task.agent] }}><Icon className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold truncate">{task.title}</span>
                            <span className="block text-xs text-muted-foreground truncate">{KIND[task.kind].label}{summaryLine(task) ? ` · ${summaryLine(task)}` : ""}</span>
                          </span>
                          {task.status === "done" ? <Check className="h-4 w-4 text-health-normal" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </React.Fragment>
            )
          })}
          {sending && <WorkLog live steps={liveSteps} durationMs={runStarted ? Date.now() - runStarted : undefined} />}
        </div>
      </div>

      <div className="shrink-0 px-3 sm:px-6 pb-3 pt-1 safe-bottom">
        <div className="mx-auto max-w-2xl">
          {(error || voice.error) && <p role="alert" className="mb-2 rounded-xl bg-health-danger/10 px-3 py-2 text-xs text-health-danger">{error || voice.error}</p>}
          {showStarters && (
            <div className="mb-2 rounded-2xl border border-border bg-card p-1.5 shadow-lg">
              {agent.starters.map(starter => (
                <button key={starter} type="button" onClick={() => send(starter)} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary">{starter}</button>
              ))}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); send(draft) }} className="flex items-end gap-2 rounded-[1.6rem] border border-border bg-card p-1.5 shadow-sm focus-within:border-primary/50">
            <button type="button" onClick={() => setShowStarters(s => !s)} aria-label="Suggested requests" aria-expanded={showStarters} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-secondary/70">
              <Plus className={cn("h-4 w-4 transition-transform", showStarters && "rotate-45")} />
            </button>
            <label htmlFor="agent-input" className="sr-only">Message {agent.name}</label>
            <textarea id="agent-input" ref={inputRef} rows={1} value={draft} maxLength={2000} disabled={sending}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft) } }}
              placeholder={voice.state === "recording" ? "Listening…" : voice.state === "transcribing" ? "Transcribing…" : `Message ${agent.name}`}
              className="min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60" />
            {draft.trim() || !voice.supported ? (
              <button type="submit" disabled={sending || !draft.trim()} aria-label="Send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            ) : (
              <button type="button" onClick={voice.toggle} disabled={sending || voice.state === "transcribing"} aria-label={voice.state === "recording" ? "Stop recording" : "Speak your request"}
                className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-background disabled:opacity-50", voice.state === "recording" ? "bg-health-danger animate-pulse" : "bg-foreground")}>
                {voice.state === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : voice.state === "recording" ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
          </form>
          <p className="mt-2 px-2 text-center text-[10px] leading-snug text-muted-foreground/80">Sends your message and {agent.usesRecords} to our AI provider.{active === "research" || active === "shopping" ? " Public sources get search terms only." : ""} Not medical advice. In an emergency, call 911.</p>
        </div>
      </div>
    </section>
  )

  const panel = (
    <aside aria-label={`${agent.name} queue and routines`} className={cn("w-full lg:w-[360px] shrink-0 flex-col border-l border-border bg-background/40", view === "panel" ? "flex" : "hidden", panelOpen ? "lg:flex" : "lg:hidden")}>
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <button type="button" onClick={() => setView("chat")} aria-label="Back to conversation" className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"><ChevronLeft className="h-5 w-5" /></button>
        <AgentAvatar agent={active} size={26} />
        <p className="text-sm font-semibold">{agent.name} queue</p>
        <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close panel" className="hidden lg:flex ml-auto h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={cn("rounded-2xl border px-3 py-2.5 text-left transition-colors", filter === f.key ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-secondary/50")}>
                <span className={cn("block text-xl font-semibold leading-none", filter === f.key ? "text-primary" : "text-foreground")}>{agentCounts[f.key]}</span>
                <span className="block text-[11px] text-muted-foreground mt-1.5">{f.label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2.5">
            {queue.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                {filter === "todo" ? `Nothing from ${agent.name} needs you.` : filter === "waiting" ? "Requests you've sent and are waiting on show up here." : "Finished tasks show up here."}
              </p>
            ) : queue.map(task => (
              <TaskCard key={`${task.id}${focusTaskId === task.id ? "-focus" : ""}`} task={task} defaultOpen={focusTaskId === task.id}
                onStatus={(status: TaskStatus) => updateTask(task, { status })}
                onPayload={(patch, dueAt) => updateTask(task, { payload: { ...task.payload, ...patch }, ...(dueAt !== undefined ? { due_at: dueAt } : {}) })} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Routines</p>
          {routines.length === 0 ? (
            <p className="text-xs text-muted-foreground/80">Reminders this agent prepares show up here once you add them to your calendar.</p>
          ) : (
            <ul className="space-y-1">
              {routines.map(routine => (
                <li key={routine.id}>
                  <button type="button" onClick={() => { const t = tasks.find(x => x.id === routine.taskId); if (t) openTask(t) }} className="w-full flex items-start gap-3 rounded-xl px-1 py-2 text-left hover:bg-secondary/50">
                    {routine.on ? <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-health-normal" /> : <CalendarPlus className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" />}
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">{routine.title}</span>
                      <span className="block text-[13px] text-muted-foreground">{routine.schedule}</span>
                      <span className={cn("block text-[11px] mt-0.5", routine.on ? "text-health-normal" : "text-muted-foreground/80")}>{routine.status}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">What {agent.name} can do</p>
          <ul className="space-y-2">
            {agent.capabilities.map(c => (
              <li key={c.label} className="flex items-start gap-2.5 text-[13px]">
                {c.status === "works" ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-health-normal" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className={c.status === "works" ? "text-foreground" : "text-muted-foreground"}>{c.label}{c.status !== "works" && <span className="block text-[11px]">{c.status === "coming" ? "Coming next" : "Needs a connection"}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground/80">Agents prepare drafts and reminders. Nothing is sent, booked or bought for you.</p>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-[1440px] lg:px-6 lg:py-5">
        <div className="flex h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-6.5rem)] overflow-hidden bg-card lg:rounded-[1.75rem] lg:border lg:border-border lg:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.25)]">
          {sidebar}
          {mobileHome}
          {chat}
          {panel}
        </div>
      </main>

      {showConnections && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setShowConnections(false)}>
          <div className="w-full rounded-t-3xl bg-card p-5 pb-8 safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-semibold">Connections</p>
              <button type="button" onClick={() => setShowConnections(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <ConnectionsList />
          </div>
        </div>
      )}
    </div>
  )
}
