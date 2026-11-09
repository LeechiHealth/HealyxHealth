// The tools each agent can choose to call. Every tool either looks something up
// (web, PubMed, trials, FDA labels, the person's queue) or changes the person's
// own Healyx queue. None of them contacts anyone, logs in, submits or buys.

import type { z } from "zod"
import type { AgentId } from "@/lib/agents/config"
import type { ToolSchema } from "@/lib/agents/llm"
import { browseWeb } from "@/lib/agents/web"
import { fetchDrugLabel, labelMentions, searchPubMed, searchTrials, sectionText, type DrugLabel, type LabelMention } from "@/lib/agents/research"
import { AppointmentAction, MedReminderAction, RefillAction, ShoppingAction } from "@/lib/agents/schema"
import { taskFromAction, type NewTask, type TaskStatus } from "@/lib/agents/tasks"
import { recordTerms, type Records } from "@/lib/agents/records"

type Env = Record<string, string | undefined>

export interface GatheredSource { n: number; kind: "web" | "pubmed" | "trial" | "fda_label"; title: string; url: string; meta?: string }

export interface AgentContext {
  agent: AgentId
  userId: string
  db: any
  records: Records
  today: string
  tzOffsetMinutes: number
  question: string
  tasks: NewTask[]
  updates: { id: string; status: TaskStatus }[]
  sources: GatheredSource[]
  mentions: LabelMention[]
  env: Env
}

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  label: (args: any) => string
  run: (args: any, ctx: AgentContext) => Promise<unknown>
}

const clip = (value: unknown, max: number) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function addSource(ctx: AgentContext, source: Omit<GatheredSource, "n">): number {
  const existing = ctx.sources.find(s => s.url === source.url)
  if (existing) return existing.n
  const n = ctx.sources.length + 1
  ctx.sources.push({ ...source, n })
  return n
}

const problems = (error: z.ZodError) => error.issues.slice(0, 6).map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`)

function saveTask(ctx: AgentContext, action: Parameters<typeof taskFromAction>[1]) {
  const task = taskFromAction(ctx.agent, action, { today: ctx.today, tzOffsetMinutes: ctx.tzOffsetMinutes })
  ctx.tasks.push(task)
  return task
}

const str = (description: string) => ({ type: "string", description })
// Optional fields are plain types left out of "required"; some providers reject null unions.
const strOrNull = (description: string) => ({ type: "string", description: `${description}. Leave out if unknown.` })

// ─── Lookups ────────────────────────────────────────────────────────────────

const webBrowse: AgentTool = {
  name: "web_browse",
  description: "Search the public web and read the pages. Use it for clinics, doctors, office hours, availability pages, prices, products, pharmacy details, guidelines or news. Returns findings with numbered sources. Never put the person's name, birth date or other identifiers in the question; a city or ZIP is fine only if they gave it.",
  parameters: { type: "object", properties: { question: str("What to find out, phrased like a search") }, required: ["question"] },
  label: args => `Searching the web: ${clip(args?.question, 70)}`,
  run: async (args, ctx) => {
    const finding = await browseWeb(String(args?.question || ""), ctx.env)
    const sources = finding.sources.map(s => ({ n: addSource(ctx, { kind: "web", title: s.title, url: s.url }), title: s.title, url: s.url }))
    return { findings: finding.answer.slice(0, 3000), sources }
  },
}

const pubmed: AgentTool = {
  name: "search_pubmed",
  description: "Search PubMed for reviews, guidelines and trials. Use 2-4 key concepts joined with AND, for example: magnesium AND (sleep OR insomnia). Returns numbered sources with abstract excerpts.",
  parameters: { type: "object", properties: { query: str("PubMed query in English") }, required: ["query"] },
  label: args => `Searching PubMed: ${clip(args?.query, 60)}`,
  run: async (args, ctx) => {
    const results = await searchPubMed(String(args?.query || ""), 5)
    return results.map(r => ({ n: addSource(ctx, { kind: "pubmed", title: r.title, url: r.url, meta: r.meta }), title: r.title, type: r.meta, excerpt: r.excerpt.slice(0, 500) }))
  },
}

const trials: AgentTool = {
  name: "search_trials",
  description: "Find recruiting studies on ClinicalTrials.gov for a condition or treatment. A registration is not a result.",
  parameters: { type: "object", properties: { query: str("Condition or treatment") }, required: ["query"] },
  label: args => `Checking ClinicalTrials.gov: ${clip(args?.query, 60)}`,
  run: async (args, ctx) => {
    const results = await searchTrials(String(args?.query || ""), 3)
    return results.map(r => ({ n: addSource(ctx, { kind: "trial", title: r.title, url: r.url, meta: r.meta }), title: r.title, details: r.meta, summary: r.excerpt.slice(0, 400) }))
  },
}

const drugLabel: AgentTool = {
  name: "get_fda_label",
  description: "Read the official FDA label for a medicine or over-the-counter product: uses, warnings, interactions, who should ask a doctor first. Also reports where the label names one of the person's saved medications or conditions (a mention, not a confirmed interaction).",
  parameters: { type: "object", properties: { drug: str("Generic or brand name, for example ibuprofen") }, required: ["drug"] },
  label: args => `Reading the FDA label for ${clip(args?.drug, 40)}`,
  run: async (args, ctx) => {
    const name = String(args?.drug || "")
    const label = (await fetchDrugLabel(name)) || (await fetchDrugLabel(name, true))
    if (!label) return { found: false, note: "No FDA label found for that name." }
    const n = addSource(ctx, { kind: "fda_label", title: `FDA label: ${label.product}`, url: label.url, meta: `${label.otc ? "Over-the-counter" : "Prescription"} drug label · DailyMed` })
    const mentions = labelMentions(label, recordTerms(ctx.records))
    for (const mention of mentions) if (!ctx.mentions.some(m => m.drug === mention.drug && m.term === mention.term)) ctx.mentions.push(mention)
    return {
      found: true, n, product: label.product, otc: label.otc,
      sections: sectionText(label, ["boxed_warning", "indications_and_usage", "contraindications", "do_not_use", "ask_doctor", "ask_doctor_or_pharmacist", "drug_interactions", "warnings_and_cautions", "warnings"], 600),
      mentions_of_saved_records: mentions.map(m => ({ record: m.term, label_says: m.matched, section: m.section, excerpt: m.excerpt })),
    }
  },
}

// ─── The person's queue ─────────────────────────────────────────────────────

const listTasks: AgentTool = {
  name: "list_my_tasks",
  description: "See what is already in the person's Healyx queue so you don't duplicate work and can follow up.",
  parameters: { type: "object", properties: { scope: { type: "string", enum: ["this_agent", "all"], description: "Default this_agent" } } },
  label: () => "Checking your queue",
  run: async (args, ctx) => {
    let query = ctx.db.from("agent_tasks").select("id, agent, kind, title, status, created_at").eq("user_id", ctx.userId).neq("status", "dismissed")
    if (args?.scope !== "all") query = query.eq("agent", ctx.agent)
    const { data, error } = await query.order("created_at", { ascending: false }).limit(20)
    if (error) return { error: "The queue couldn't be read right now." }
    return { tasks: data || [] }
  },
}

const updateTask: AgentTool = {
  name: "update_task_status",
  description: "Move a task in the person's queue when they tell you its status changed, for example they sent a request (waiting) or picked up a refill (done).",
  parameters: { type: "object", properties: { task_id: str("Task id from list_my_tasks"), status: { type: "string", enum: ["todo", "waiting", "done"] } }, required: ["task_id", "status"] },
  label: args => `Marking a task ${args?.status === "done" ? "done" : args?.status === "waiting" ? "as waiting" : "to do"}`,
  run: async (args, ctx) => {
    const status = args?.status as TaskStatus
    if (!["todo", "waiting", "done"].includes(status) || typeof args?.task_id !== "string") return { error: "Give a task_id from list_my_tasks and a status of todo, waiting or done." }
    const { data, error } = await ctx.db.from("agent_tasks").update({ status }).eq("id", args.task_id).eq("user_id", ctx.userId).select("id, title").single()
    if (error || !data) return { error: "That task couldn't be updated. Check the id with list_my_tasks." }
    ctx.updates.push({ id: data.id, status })
    return { updated: true, title: data.title, status }
  },
}

// ─── Things the agent prepares ──────────────────────────────────────────────

const prepareAppointment: AgentTool = {
  name: "prepare_appointment",
  description: "Add a visit to the person's queue. To request a new visit, include request_message (for a portal or email) and phone_script, and leave starts_at null. For a visit they already have, set starts_at; the app creates calendar alerts 1 day and 1 hour before. Use [Your name] style placeholders for unknown details.",
  parameters: {
    type: "object",
    properties: {
      title: str("e.g. Dentist cleaning with Dr. Lee"), provider: strOrNull("Doctor or clinic"), reason: str("Why the visit"),
      starts_at: strOrNull("Local date-time YYYY-MM-DDTHH:MM, only if the person gave a date and time"),
      duration_minutes: { type: "integer" }, location: strOrNull("Address or clinic name"),
      request_message: strOrNull("Message asking for an appointment"), phone_script: strOrNull("What to say when calling"),
      questions_to_ask: { type: "array", items: { type: "string" }, description: "Up to 5, from records or what they said" },
    },
    required: ["title", "reason"],
  },
  label: args => `Preparing ${clip(args?.title || "a visit", 50)}`,
  run: async (args, ctx) => {
    const parsed = AppointmentAction.safeParse({ ...args, kind: "appointment" })
    if (!parsed.success) return { error: "Not saved. Fix these and call again.", problems: problems(parsed.error) }
    const task = saveTask(ctx, parsed.data)
    return { saved: true, title: task.title, starts_at: task.payload.starts_at || null, calendar_alerts: task.payload.starts_at ? "1 day and 1 hour before" : "added when they enter the booked time" }
  },
}

const medReminder: AgentTool = {
  name: "set_medication_reminder",
  description: "Add a recurring medication reminder the person can put on their calendar. Times are 24-hour HH:MM. Use their stated times (times_confirmed true) or propose times from the recorded frequency (times_confirmed false). Empty days means every day. Never for as-needed or stopped medications.",
  parameters: {
    type: "object",
    properties: {
      medication: str("Name as recorded"), dose: strOrNull("Dose exactly as recorded or stated"),
      times: { type: "array", items: { type: "string", description: "HH:MM, 24-hour" } },
      days: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] } },
      instructions: strOrNull("Only if recorded or stated, e.g. with food"), times_confirmed: { type: "boolean" },
    },
    required: ["medication", "times"],
  },
  label: args => `Setting a reminder for ${clip(args?.medication, 40)}`,
  run: async (args, ctx) => {
    const parsed = MedReminderAction.safeParse({ ...args, kind: "med_reminder" })
    if (!parsed.success) return { error: "Not saved. Fix these and call again.", problems: problems(parsed.error) }
    const task = saveTask(ctx, parsed.data)
    return { saved: true, title: task.title, times: task.payload.times, every_day: !task.payload.days?.length }
  },
}

const refill: AgentTool = {
  name: "prepare_refill_request",
  description: "Add a refill request to the queue: a message for the pharmacy or prescriber and a short phone script, using the dose, pharmacy and prescriber as recorded. If you know doses left and doses per day, include them; the app works out the run-out date and a reminder 5 days before.",
  parameters: {
    type: "object",
    properties: {
      medication: str("Name as recorded"), dose: strOrNull("Dose as recorded"), pharmacy: strOrNull("Pharmacy as recorded"), prescriber: strOrNull("Prescriber as recorded"),
      message: str("Refill request message"), phone_script: strOrNull("What to say when calling"),
      supply_remaining: { type: "number", description: "Doses left" }, doses_per_day: { type: "number" },
    },
    required: ["medication", "message"],
  },
  label: args => `Drafting a refill request for ${clip(args?.medication, 40)}`,
  run: async (args, ctx) => {
    const parsed = RefillAction.safeParse({ ...args, kind: "refill_request" })
    if (!parsed.success) return { error: "Not saved. Fix these and call again.", problems: problems(parsed.error) }
    const task = saveTask(ctx, parsed.data)
    return { saved: true, title: task.title, runs_out_on: task.payload.runs_out_on || null, remind_on: task.payload.remind_on || null }
  },
}

async function checkItemLabel(item: any, ctx: AgentContext) {
  if (!item.active_ingredient) return item
  try {
    const label: DrugLabel | null = (await fetchDrugLabel(item.active_ingredient, true)) || (await fetchDrugLabel(item.active_ingredient))
    if (!label) return { ...item, label_check: { checked: false, reason: "No FDA label was found for this ingredient. Check the package label and ask a pharmacist." } }
    const terms = recordTerms(ctx.records)
    addSource(ctx, { kind: "fda_label", title: `FDA label: ${label.product}`, url: label.url, meta: "Over-the-counter drug label · DailyMed" })
    return { ...item, label_check: {
      checked: true, product: label.product, url: label.url, terms_checked: terms.length,
      matches: labelMentions(label, terms),
      sections: sectionText(label, ["do_not_use", "ask_doctor", "ask_doctor_or_pharmacist", "stop_use"], 500),
    } }
  } catch {
    return { ...item, label_check: { checked: false, reason: "The FDA label service didn't respond. Check the package label before buying." } }
  }
}

const shoppingList: AgentTool = {
  name: "make_shopping_list",
  description: "Add a shopping list to the queue. Items are generic product types (not brands) with what to look for. Set active_ingredient for over-the-counter medicines or supplements; the app checks each label against the person's saved medications and conditions and returns the result.",
  parameters: {
    type: "object",
    properties: {
      title: str("List title"),
      items: { type: "array", items: { type: "object", properties: { name: str("Generic product type"), why: str("Why it fits"), look_for: str("Features to compare"), active_ingredient: strOrNull("One generic ingredient, OTC medicines and supplements only"), search_terms: str("Short product search") }, required: ["name", "why", "look_for", "search_terms"] } },
      notes: strOrNull("Optional notes"),
    },
    required: ["title", "items"],
  },
  label: args => `Building a shopping list${Array.isArray(args?.items) && args.items.some((i: any) => i?.active_ingredient) ? " and checking labels" : ""}`,
  run: async (args, ctx) => {
    const parsed = ShoppingAction.safeParse({ ...args, kind: "shopping_list" })
    if (!parsed.success) return { error: "Not saved. Fix these and call again.", problems: problems(parsed.error) }
    const items = await Promise.all(parsed.data.items.slice(0, 6).map(item => checkItemLabel(item, ctx)))
    const task = saveTask(ctx, { ...parsed.data, items })
    return {
      saved: true, title: task.title,
      label_checks: items.filter(i => i.label_check).map(i => ({ item: i.name, checked: i.label_check.checked, mentions_of_saved_records: i.label_check.matches?.map((m: LabelMention) => ({ record: m.term, label_says: m.matched, section: m.section })) || [], note: i.label_check.reason })),
    }
  },
}

const researchBrief: AgentTool = {
  name: "save_research_brief",
  description: "Save what you found as a research brief in the queue. Every point must cite the source numbers (n) from your tool results that directly support it; points without valid citations are dropped.",
  parameters: {
    type: "object",
    properties: {
      topic: str("3-8 word topic"),
      points: { type: "array", items: { type: "object", properties: { text: str("One finding in plain language"), cites: { type: "array", items: { type: "integer" } } }, required: ["text", "cites"] } },
      ask_clinician: { type: "array", items: { type: "string" }, description: "Up to 3 questions for a clinician or pharmacist" },
      limits: strOrNull("What these sources can't tell them"),
    },
    required: ["topic", "points"],
  },
  label: () => "Saving a research brief",
  run: async (args, ctx) => {
    const valid = new Set(ctx.sources.map(s => s.n))
    const points = (Array.isArray(args?.points) ? args.points : []).slice(0, 6)
      .map((p: any) => ({ text: clip(p?.text, 500), cites: [...new Set((Array.isArray(p?.cites) ? p.cites : []).map(Number).filter((n: number) => valid.has(n)))] }))
      .filter((p: { text: string; cites: number[] }) => p.text && p.cites.length)
    if (!points.length) return { error: "Not saved. Each point needs cites with source numbers from your tool results. Look something up first if you have no sources." }
    const topic = clip(args?.topic || ctx.question, 80)
    ctx.tasks.push({
      agent: ctx.agent, kind: "research_brief", title: topic, status: "todo", due_at: null,
      payload: {
        topic, question: ctx.question, points,
        sources: ctx.sources.map(s => ({ n: s.n, kind: s.kind, title: s.title, url: s.url, meta: s.meta || (s.kind === "web" ? "Web page" : "") })),
        label_mentions: ctx.mentions, terms_checked: recordTerms(ctx.records).length,
        ask_clinician: (Array.isArray(args?.ask_clinician) ? args.ask_clinician : []).slice(0, 3).map((q: unknown) => clip(q, 240)),
        limits: args?.limits ? clip(args.limits, 400) : undefined, unavailable: [],
      },
    })
    return { saved: true, points_kept: points.length, points_dropped: (args?.points?.length || 0) - points.length }
  },
}

export const TOOLSETS: Record<AgentId, AgentTool[]> = {
  appointments: [webBrowse, prepareAppointment, listTasks, updateTask],
  medications: [medReminder, refill, drugLabel, webBrowse, listTasks, updateTask],
  research: [pubmed, drugLabel, trials, webBrowse, researchBrief, listTasks],
  shopping: [webBrowse, drugLabel, shoppingList, listTasks, updateTask],
}

export function toolSchemas(tools: AgentTool[]): ToolSchema[] {
  return tools.map(tool => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }))
}
