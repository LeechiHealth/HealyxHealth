"use client"

import * as React from "react"
import { AlertTriangle, CalendarPlus, Check, ChevronDown, Copy, ExternalLink, Phone, MessageSquare, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { agentById } from "@/lib/agents/config"
import { formatClock, formatLocalDate, formatLocalDateTime, isLocalDate, isLocalDateTime, localNow, localToUtcIso } from "@/lib/agents/dates"
import { downloadIcs, googleCalendarUrl, recurrenceRule, type CalendarEvent } from "@/lib/agents/ics"
import { placeholders } from "@/lib/agents/safety"
import { STORE_SEARCHES, type AgentTask, type TaskStatus } from "@/lib/agents/tasks"
import { AgentAvatar } from "./agent-avatar"

interface TaskCardProps {
  task: AgentTask
  defaultOpen?: boolean
  onStatus: (status: TaskStatus) => void
  onPayload: (patch: Record<string, unknown>, dueAt?: string | null) => void
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "reminder"

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked */ }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
      {copied ? <Check className="h-3 w-3 text-health-normal" /> : <Copy className="h-3 w-3" />}{copied ? "Copied" : label}
    </button>
  )
}

function Draft({ icon: Icon, label, text }: { icon: typeof Copy; label: string; text?: string }) {
  if (!text) return null
  const missing = placeholders(text)
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
        <CopyButton text={text} />
      </div>
      <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{text}</p>
      {missing.length > 0 && <p className="text-[11px] text-health-warning mt-2">Fill in before sending: {missing.join(", ")}</p>}
    </div>
  )
}

function CalendarButtons({ events, filename, note }: { events: CalendarEvent[]; filename: string; note?: string }) {
  if (!events.length) return null
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => downloadIcs(filename, events)} className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-semibold hover:opacity-90">
          <CalendarPlus className="h-3.5 w-3.5" />Apple / Outlook (.ics)
        </button>
        {events.map(event => (
          <a key={event.uid} href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/50">
            Google{events.length > 1 ? ` · ${formatClock(event.start.slice(11))}` : ""}<ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/80">{note || "Adds the reminder to your own calendar. Healyx doesn't send notifications yet."}</p>
    </div>
  )
}

function StatusActions({ task, onStatus }: { task: AgentTask; onStatus: TaskCardProps["onStatus"] }) {
  const button = "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
  const waitingLabel: Record<string, string> = { appointment: "I requested it", refill_request: "I sent it" }
  const doneLabel: Record<string, string> = { appointment: "Done", med_reminder: "I added it", refill_request: "Picked up", research_brief: "Read", shopping_list: "Done" }
  if (task.status === "done") {
    return <button type="button" onClick={() => onStatus("todo")} className={cn(button, "border border-border text-muted-foreground hover:text-foreground")}>Reopen</button>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {task.status === "todo" && waitingLabel[task.kind] && (
        <button type="button" onClick={() => onStatus("waiting")} className={cn(button, "border border-border text-foreground hover:border-primary/50")}>{waitingLabel[task.kind]}</button>
      )}
      <button type="button" onClick={() => onStatus("done")} className={cn(button, "bg-secondary text-foreground hover:bg-secondary/70")}>{doneLabel[task.kind] || "Done"}</button>
    </div>
  )
}

function AppointmentBody({ task, onPayload }: Pick<TaskCardProps, "task" | "onPayload">) {
  const p = task.payload
  const [when, setWhen] = React.useState<string>(p.starts_at || "")
  const [editing, setEditing] = React.useState(false)
  const events: CalendarEvent[] = isLocalDateTime(p.starts_at) ? [{
    uid: `${task.id}@healyx`, title: p.title || task.title, start: p.starts_at, durationMinutes: p.duration_minutes || 30,
    location: p.location, description: [p.reason, ...(p.questions_to_ask?.length ? ["Questions to ask:", ...p.questions_to_ask.map((q: string) => `- ${q}`)] : [])].filter(Boolean).join("\n"),
    alarmsMinutesBefore: [1440, 60],
  }] : []
  return (
    <div className="space-y-3">
      {p.starts_at && isLocalDateTime(p.starts_at) && !editing ? (
        <div>
          <p className="text-xs font-semibold text-foreground">{formatLocalDateTime(p.starts_at)}{p.location ? ` · ${p.location}` : ""} <button type="button" onClick={() => setEditing(true)} className="ml-1 text-[11px] font-medium text-primary hover:underline">Change</button></p>
          <div className="mt-2"><CalendarButtons events={events} filename={`healyx-${slug(task.title)}`} note="Includes alerts 1 day and 1 hour before." /></div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-3">
          <label className="text-[11px] font-semibold text-muted-foreground" htmlFor={`when-${task.id}`}>{editing ? "Correct the date and time" : "Once it's booked, enter the time to create reminders"}</label>
          <div className="mt-2 flex gap-2">
            <input id={`when-${task.id}`} type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
            <button type="button" disabled={!isLocalDateTime(when)} onClick={() => { onPayload({ starts_at: when }, localToUtcIso(when, new Date().getTimezoneOffset())); setEditing(false) }} className="rounded-lg bg-primary text-primary-foreground px-3 text-[11px] font-semibold disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
      <Draft icon={MessageSquare} label="Request message" text={p.request_message} />
      <Draft icon={Phone} label="Call script" text={p.phone_script} />
      {Array.isArray(p.questions_to_ask) && p.questions_to_ask.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5"><p className="text-[11px] font-semibold text-muted-foreground">Questions to ask</p><CopyButton text={p.questions_to_ask.map((q: string) => `- ${q}`).join("\n")} /></div>
          <ul className="space-y-1">{p.questions_to_ask.map((q: string, i: number) => <li key={i} className="text-xs text-foreground/90 pl-3 relative before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-primary">{q}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function MedReminderBody({ task, onPayload }: Pick<TaskCardProps, "task" | "onPayload">) {
  const p = task.payload
  const [times, setTimes] = React.useState<string[]>(Array.isArray(p.times) ? p.times : ["08:00"])
  const changed = times.join() !== (p.times || []).join()
  const start = isLocalDate(p.start_date) ? p.start_date : localNow().slice(0, 10)
  const rrule = recurrenceRule(p.days || [])
  const events: CalendarEvent[] = times.filter(t => /^\d{2}:\d{2}$/.test(t)).map((time, i) => ({
    uid: `${task.id}-${i}@healyx`, title: task.title, start: `${start}T${time}`, durationMinutes: 5, rrule,
    description: [p.instructions, "Reminder from Healyx. Take as directed on your prescription label."].filter(Boolean).join("\n"),
    alarmsMinutesBefore: [0],
  }))
  return (
    <div className="space-y-3">
      {p.instructions && <p className="text-xs text-muted-foreground">{p.instructions}</p>}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">{rrule === "FREQ=DAILY" ? "Every day at" : `On ${(p.days || []).join(", ")} at`}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {times.map((time, i) => (
            <input key={i} type="time" value={time} aria-label={`Reminder time ${i + 1}`} onChange={e => setTimes(prev => prev.map((t, j) => (j === i ? e.target.value : t)))} className="rounded-lg border border-border bg-background px-2 py-1 text-xs" />
          ))}
          {changed && <button type="button" onClick={() => onPayload({ times, times_confirmed: true })} className="rounded-lg bg-secondary px-2.5 py-1 text-[11px] font-semibold">Save times</button>}
        </div>
        {!p.times_confirmed && !changed && <p className="text-[11px] text-health-warning mt-1.5">Suggested times. Match them to your prescription label.</p>}
      </div>
      <CalendarButtons events={events} filename={`healyx-${slug(task.title)}`} />
    </div>
  )
}

function RefillBody({ task, onPayload }: Pick<TaskCardProps, "task" | "onPayload">) {
  const p = task.payload
  const [remindOn, setRemindOn] = React.useState<string>(p.remind_on || "")
  const events: CalendarEvent[] = isLocalDate(p.remind_on) ? [{
    uid: `${task.id}@healyx`, title: `Request refill: ${p.medication}${p.dose ? ` ${p.dose}` : ""}`, start: `${p.remind_on}T09:00`, durationMinutes: 15,
    description: [p.pharmacy && `Pharmacy: ${p.pharmacy}`, p.prescriber && `Prescriber: ${p.prescriber}`, p.runs_out_on && `Estimated last dose: ${p.runs_out_on}`].filter(Boolean).join("\n"),
    alarmsMinutesBefore: [0],
  }] : []
  return (
    <div className="space-y-3">
      {(p.pharmacy || p.prescriber) && <p className="text-xs text-muted-foreground">{[p.pharmacy && `Pharmacy: ${p.pharmacy}`, p.prescriber && `Prescriber: ${p.prescriber}`].filter(Boolean).join(" · ")}</p>}
      {p.runs_out_on && (
        <div className="rounded-xl bg-primary/[0.07] border border-primary/20 p-3 text-xs">
          <p className="font-semibold text-foreground">About {p.days_left} {p.days_left === 1 ? "day" : "days"} left. Runs out around {formatLocalDate(p.runs_out_on)}.</p>
          <p className="text-muted-foreground mt-1">Based on {p.supply_remaining} doses at {p.doses_per_day} a day. Reminder on {formatLocalDate(p.remind_on)}, 5 days ahead.</p>
        </div>
      )}
      {isLocalDate(p.remind_on) ? (
        <CalendarButtons events={events} filename={`healyx-refill-${slug(p.medication || task.title)}`} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-3">
          <label className="text-[11px] font-semibold text-muted-foreground" htmlFor={`remind-${task.id}`}>Pick a day to be reminded to request it</label>
          <div className="mt-2 flex gap-2">
            <input id={`remind-${task.id}`} type="date" value={remindOn} onChange={e => setRemindOn(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs" />
            <button type="button" disabled={!isLocalDate(remindOn)} onClick={() => onPayload({ remind_on: remindOn }, localToUtcIso(`${remindOn}T09:00`, new Date().getTimezoneOffset()))} className="rounded-lg bg-primary text-primary-foreground px-3 text-[11px] font-semibold disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
      <Draft icon={MessageSquare} label="Refill request" text={p.message} />
      <Draft icon={Phone} label="Call script" text={p.phone_script} />
    </div>
  )
}

function ResearchBody({ task }: Pick<TaskCardProps, "task">) {
  const p = task.payload
  const sources: any[] = Array.isArray(p.sources) ? p.sources : []
  const byN = new Map(sources.map(s => [s.n, s]))
  const mentions: any[] = Array.isArray(p.label_mentions) ? p.label_mentions : []
  const hasLabels = sources.some(s => s.kind === "fda_label")
  return (
    <div className="space-y-3">
      {Array.isArray(p.points) && p.points.length > 0 ? (
        <ul className="space-y-2">
          {p.points.map((point: any, i: number) => (
            <li key={i} className="text-xs text-foreground/90 leading-relaxed">
              {point.text}{" "}
              {point.cites.map((n: number) => byN.get(n) && (
                <a key={n} href={byN.get(n).url} target="_blank" rel="noopener noreferrer" title={byN.get(n).title} className="inline-flex items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-semibold px-1 min-w-[1.25rem] mr-0.5 hover:bg-primary/20">{n}</a>
              ))}
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">No summary points could be tied to a source. Open the sources below.</p>}

      {mentions.length > 0 && (
        <div className="rounded-xl border border-health-warning/40 bg-health-warning/[0.08] p-3 space-y-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-health-warning"><AlertTriangle className="h-3.5 w-3.5" />FDA label mentions something in your records</p>
          {mentions.map((m, i) => (
            <div key={i} className="text-xs">
              <p className="text-foreground"><span className="font-semibold">{m.drug}</span> label, {m.section}, mentions <span className="font-semibold">&ldquo;{m.matched || m.term}&rdquo;</span>{m.matched && m.matched !== m.term ? <span className="text-muted-foreground"> (your record: {m.term})</span> : null}:</p>
              <p className="text-muted-foreground mt-0.5 italic">{m.excerpt}</p>
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary underline underline-offset-2">Read the full label</a>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">A mention is not a confirmed interaction. Ask your pharmacist what it means for you.</p>
        </div>
      )}
      {mentions.length === 0 && hasLabels && p.terms_checked > 0 && (
        <p className="text-[11px] text-muted-foreground">We searched these labels for your {p.terms_checked} saved medication and condition names, plus common equivalents like &ldquo;high blood pressure&rdquo;, and found no mentions. Labels can word things differently, so this is not a clearance.</p>
      )}

      {Array.isArray(p.ask_clinician) && p.ask_clinician.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5"><p className="text-[11px] font-semibold text-muted-foreground">Questions for your clinician or pharmacist</p><CopyButton text={p.ask_clinician.map((q: string) => `- ${q}`).join("\n")} /></div>
          <ul className="space-y-1">{p.ask_clinician.map((q: string, i: number) => <li key={i} className="text-xs text-foreground/90">{q}</li>)}</ul>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Sources</p>
        <ol className="space-y-1.5">
          {sources.map(s => (
            <li key={s.n} className="text-xs flex gap-2">
              <span className="text-[10px] font-semibold text-primary w-4 shrink-0 pt-0.5">{s.n}</span>
              <span className="min-w-0"><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-primary underline-offset-2 hover:underline">{s.title}</a><span className="block text-[10px] text-muted-foreground">{s.meta}</span></span>
            </li>
          ))}
        </ol>
      </div>
      {p.limits && <p className="text-[11px] text-muted-foreground">{p.limits}</p>}
      {Array.isArray(p.unavailable) && p.unavailable.length > 0 && <p className="text-[11px] text-health-warning">{p.unavailable.join(" and ")} didn&apos;t respond, so results may be incomplete.</p>}
      <p className="text-[10px] text-muted-foreground/80">Summaries come from abstracts and labels, not full papers. Educational, not medical advice.</p>
    </div>
  )
}

function ShoppingBody({ task }: Pick<TaskCardProps, "task">) {
  const p = task.payload
  const items: any[] = Array.isArray(p.items) ? p.items : []
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
          <div>
            <p className="text-xs font-semibold text-foreground">{item.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{item.why}</p>
          </div>
          <p className="text-[11px] text-foreground/90"><span className="font-semibold">Look for:</span> {item.look_for}</p>
          {item.label_check && (item.label_check.checked ? (
            <div className={cn("rounded-lg p-2.5 text-[11px] space-y-1.5", item.label_check.matches?.length ? "bg-health-warning/[0.1] border border-health-warning/40" : "bg-secondary/60")}>
              {item.label_check.matches?.length ? (
                <>
                  <p className="inline-flex items-center gap-1 font-semibold text-health-warning"><AlertTriangle className="h-3.5 w-3.5" />The {item.label_check.product} label mentions your records</p>
                  {item.label_check.matches.map((m: any, j: number) => <p key={j} className="text-muted-foreground"><span className="font-semibold text-foreground">{m.section}</span>{m.matched && m.matched !== m.term ? ` ("${m.matched}", your record: ${m.term})` : ` ("${m.term}")`}: <span className="italic">{m.excerpt}</span></p>)}
                </>
              ) : (
                <p className="text-muted-foreground">Checked the {item.label_check.product} label: none of your {item.label_check.terms_checked} saved medication or condition names (or common equivalents) appear in its warnings. Labels can word things differently, so read them yourself.</p>
              )}
              {Array.isArray(item.label_check.sections) && item.label_check.sections.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-primary">Read the label warnings</summary>
                  <div className="mt-1.5 space-y-1">{item.label_check.sections.map((s: any, j: number) => <p key={j} className="text-muted-foreground"><span className="font-semibold text-foreground">{s.section}:</span> {s.text}</p>)}</div>
                </details>
              )}
              <a href={item.label_check.url} target="_blank" rel="noopener noreferrer" className="inline-block text-primary underline underline-offset-2">Full FDA label</a>
            </div>
          ) : <p className="text-[11px] text-muted-foreground">{item.label_check.reason}</p>)}
          <div className="flex flex-wrap gap-1.5">
            {STORE_SEARCHES.map(store => (
              <a key={store.name} href={store.url(item.search_terms || item.name)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50">{store.name}<ExternalLink className="h-3 w-3" /></a>
            ))}
          </div>
        </div>
      ))}
      {p.notes && <p className="text-[11px] text-muted-foreground">{p.notes}</p>}
      <p className="text-[10px] text-muted-foreground/80">Store links open a search. Healyx doesn&apos;t see prices or place orders. Ask a pharmacist before starting any medicine or supplement.</p>
    </div>
  )
}

export function summaryLine(task: AgentTask): string {
  const p = task.payload
  switch (task.kind) {
    case "appointment": return p.starts_at ? formatLocalDateTime(p.starts_at) : [p.provider, "Draft request ready"].filter(Boolean).join(" · ")
    case "med_reminder": return `${(p.times || []).map(formatClock).join(", ")}${p.times_confirmed ? "" : " · suggested"}`
    case "refill_request": return p.remind_on ? `Request by ${formatLocalDate(p.remind_on)}` : p.pharmacy || "Draft request ready"
    case "research_brief": return `${(p.sources || []).length} source${(p.sources || []).length === 1 ? "" : "s"}${p.label_mentions?.length ? ` · ${p.label_mentions.length} label mention${p.label_mentions.length > 1 ? "s" : ""}` : ""}`
    case "shopping_list": return `${(p.items || []).length} items`
    default: return ""
  }
}

export function TaskCard({ task, defaultOpen = false, onStatus, onPayload }: TaskCardProps) {
  const [open, setOpen] = React.useState(defaultOpen)
  const ref = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [open])
  const agent = agentById(task.agent)
  return (
    <article ref={ref} className={cn("scroll-mt-24 rounded-2xl border bg-card transition-colors", defaultOpen ? "border-primary/40" : "border-border", task.status === "done" && "opacity-75")}>
      <div className="flex items-start gap-3 p-3.5">
        <AgentAvatar agent={task.agent} size={32} className="mt-0.5" />
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex-1 min-w-0 text-left">
          <p className={cn("text-sm font-semibold text-foreground leading-snug", task.status === "done" && "line-through decoration-muted-foreground/60")}>{task.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{agent?.name}{summaryLine(task) ? ` · ${summaryLine(task)}` : ""}{task.status === "waiting" ? " · waiting on reply" : ""}</p>
        </button>
        <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? "Collapse" : "Expand"} className="text-muted-foreground hover:text-foreground mt-1"><ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} /></button>
        <button type="button" onClick={() => onStatus("dismissed")} aria-label="Dismiss task" className="text-muted-foreground/70 hover:text-foreground mt-1"><X className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border pt-3">
          {task.kind === "appointment" && <AppointmentBody task={task} onPayload={onPayload} />}
          {task.kind === "med_reminder" && <MedReminderBody task={task} onPayload={onPayload} />}
          {task.kind === "refill_request" && <RefillBody task={task} onPayload={onPayload} />}
          {task.kind === "research_brief" && <ResearchBody task={task} />}
          {task.kind === "shopping_list" && <ShoppingBody task={task} />}
          <div className="flex items-center justify-between gap-2 pt-1">
            <StatusActions task={task} onStatus={onStatus} />
            {task.local && <span className="text-[10px] text-health-warning">Not saved</span>}
          </div>
        </div>
      )}
    </article>
  )
}
