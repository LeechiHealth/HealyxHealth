import type { AgentId } from "./config"
import { localToUtcIso, refillDates } from "./dates"
import type { AgentAction } from "./schema"

export type TaskKind = "appointment" | "med_reminder" | "refill_request" | "research_brief" | "shopping_list"
export type TaskStatus = "todo" | "waiting" | "done" | "dismissed"

export interface AgentTask {
  id: string
  agent: AgentId
  kind: TaskKind
  title: string
  status: TaskStatus
  due_at: string | null
  payload: Record<string, any>
  created_at: string
  /** True when the task could not be saved and only lives in this browser session. */
  local?: boolean
}

export interface AgentMessage {
  id: string
  agent: AgentId
  role: "user" | "assistant"
  content: string
  created_at: string
}

export type NewTask = Omit<AgentTask, "id" | "created_at" | "local">

export function taskFromAction(agent: AgentId, action: AgentAction, ctx: { today: string; tzOffsetMinutes: number }): NewTask {
  switch (action.kind) {
    case "appointment":
      return {
        agent, kind: "appointment", title: action.title, status: "todo",
        due_at: action.starts_at ? localToUtcIso(action.starts_at, ctx.tzOffsetMinutes) : null,
        payload: { ...action },
      }
    case "med_reminder":
      return {
        agent, kind: "med_reminder", title: `Take ${action.medication}${action.dose ? ` ${action.dose}` : ""}`, status: "todo", due_at: null,
        payload: { ...action, start_date: action.start_date || ctx.today },
      }
    case "refill_request": {
      const timing = action.supply_remaining != null && action.doses_per_day ? refillDates(ctx.today, action.supply_remaining, action.doses_per_day) : null
      return {
        agent, kind: "refill_request", title: `Refill ${action.medication}`, status: "todo",
        due_at: timing ? localToUtcIso(`${timing.remind_on}T09:00`, ctx.tzOffsetMinutes) : null,
        payload: { ...action, ...(timing || {}) },
      }
    }
    case "shopping_list":
      return { agent, kind: "shopping_list", title: action.title, status: "todo", due_at: null, payload: { ...action } }
  }
}

export const STORE_SEARCHES = [
  { name: "Amazon", url: (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { name: "CVS", url: (q: string) => `https://www.cvs.com/search?searchTerm=${encodeURIComponent(q)}` },
  { name: "Walgreens", url: (q: string) => `https://www.walgreens.com/search/results.jsp?Ntt=${encodeURIComponent(q)}` },
]
