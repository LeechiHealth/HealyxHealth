import { z } from "zod"
import { AGENT_IDS, type AgentId } from "./config"
import { isLocalDate, isLocalDateTime } from "./dates"

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(value => value || undefined)
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).max(max).nullish().transform(value => value ?? [])
// A malformed date is dropped (never guessed) while the rest of the draft is kept.
const localDateTime = z.unknown().transform(value => (isLocalDateTime(value) ? value : undefined))
const localDate = z.unknown().transform(value => (isLocalDate(value) ? value : undefined))
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const weekday = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])

export const AppointmentAction = z.object({
  kind: z.literal("appointment"),
  title: text(120),
  provider: optionalText(120),
  reason: text(300),
  starts_at: localDateTime,
  duration_minutes: z.number().int().min(5).max(480).nullish().transform(value => value ?? undefined),
  location: optionalText(200),
  request_message: optionalText(1500),
  phone_script: optionalText(1200),
  questions_to_ask: list(text(240), 6),
})

export const MedReminderAction = z.object({
  kind: z.literal("med_reminder"),
  medication: text(120),
  dose: optionalText(80),
  times: z.array(clock).min(1).max(6),
  days: list(weekday, 7),
  start_date: localDate,
  instructions: optionalText(240),
  times_confirmed: z.boolean().nullish().transform(value => value === true),
})

export const RefillAction = z.object({
  kind: z.literal("refill_request"),
  medication: text(120),
  dose: optionalText(80),
  pharmacy: optionalText(160),
  prescriber: optionalText(160),
  message: text(1500),
  phone_script: optionalText(1200),
  supply_remaining: z.number().min(0).max(2000).nullish().transform(value => value ?? undefined),
  doses_per_day: z.number().min(0.1).max(24).nullish().transform(value => value ?? undefined),
})

export const ShoppingAction = z.object({
  kind: z.literal("shopping_list"),
  title: text(120),
  items: z.array(z.object({
    name: text(120),
    why: text(300),
    look_for: text(400),
    active_ingredient: optionalText(80),
    search_terms: text(120),
  })).min(1).max(6),
  notes: optionalText(500),
})

const money = z.number().min(0).max(1_000_000).nullish().transform(value => value ?? undefined)

// Field names match what the native app reads from task payloads.
export const CareOptionsAction = z.object({
  kind: z.literal("care_options"),
  title: text(120),
  need: text(300),
  options: z.array(z.object({
    name: text(160),
    specialty: optionalText(120),
    npi: z.string().regex(/^\d{10}$/).nullish().transform(value => value || undefined),
    address: optionalText(240),
    phone: optionalText(40),
    distance_miles: z.number().min(0).max(500).nullish().transform(value => value ?? undefined),
    next_opening: optionalText(120),
    price: money,
    in_network: z.enum(["yes", "no", "unknown"]).nullish().transform(value => value ?? "unknown"),
    notes: optionalText(400),
    url: optionalText(400),
  })).min(1).max(6),
  call_script: text(1500),
})

export const BillCaseAction = z.object({
  kind: z.literal("bill_case"),
  title: text(120),
  provider_or_insurer: optionalText(160),
  findings: z.array(z.object({
    issue: text(80),
    detail: text(500),
    amount: money,
  })).max(8).nullish().transform(value => value ?? []),
  estimated_savings: money,
  financial_assistance: optionalText(800),
  next_steps: list(text(240), 6),
  letter: optionalText(4000),
  letter_type: z.enum(["appeal", "itemized_bill_request", "financial_assistance", "dispute", "other"]).nullish().transform(value => value ?? undefined),
  phone_script: optionalText(1200),
  deadline: localDate,
})

export const RxSavingsAction = z.object({
  kind: z.literal("rx_savings"),
  medication: text(120),
  best: optionalText(200),
  prices: z.array(z.object({
    pharmacy: text(80),
    price: money,
    note: optionalText(240),
    url: optionalText(400),
  })).min(1).max(8),
  alternatives: list(text(240), 4),
})

export const FollowUpAction = z.object({
  kind: z.literal("follow_up"),
  title: text(120),
  due_on: localDate,
  why: text(400),
  next_step: text(300),
  category: z.enum(["lab_recheck", "screening", "referral", "results_pending", "refill", "visit", "other"]).nullish().transform(value => value ?? "other"),
})

export type AppointmentAction = z.infer<typeof AppointmentAction>
export type MedReminderAction = z.infer<typeof MedReminderAction>
export type RefillAction = z.infer<typeof RefillAction>
export type ShoppingAction = z.infer<typeof ShoppingAction>
export type CareOptionsAction = z.infer<typeof CareOptionsAction>
export type BillCaseAction = z.infer<typeof BillCaseAction>
export type RxSavingsAction = z.infer<typeof RxSavingsAction>
export type FollowUpAction = z.infer<typeof FollowUpAction>
export type AgentAction = AppointmentAction | MedReminderAction | RefillAction | ShoppingAction | CareOptionsAction | BillCaseAction | RxSavingsAction | FollowUpAction

const ALLOWED: Record<AgentId, z.ZodTypeAny[]> = {
  care_finder: [CareOptionsAction, AppointmentAction],
  bill_advocate: [BillCaseAction],
  rx_saver: [RxSavingsAction, RefillAction, MedReminderAction],
  follow_through: [FollowUpAction, AppointmentAction, MedReminderAction],
  research: [],
}

/** Keeps only well-formed actions this agent is allowed to prepare. Invalid ones are dropped, not repaired. */
export function validActions(agent: AgentId, candidates: unknown, max = 4): AgentAction[] {
  if (!Array.isArray(candidates)) return []
  const actions: AgentAction[] = []
  for (const candidate of candidates.slice(0, 8)) {
    for (const schema of ALLOWED[agent]) {
      const parsed = schema.safeParse(candidate)
      if (parsed.success) { actions.push(parsed.data); break }
    }
    if (actions.length >= max) break
  }
  return actions
}

export const RunRequest = z.object({
  agent: z.enum(AGENT_IDS),
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional().default([]),
  now: z.string().refine(isLocalDateTime, "Expected YYYY-MM-DDTHH:MM"),
  tz: z.string().max(64).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).optional().default(0),
  // Photos (bills, statements, labels): up to 3, same limits as /api/chat.
  images: z.array(z.object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/heic", "image/webp"]),
    data: z.string().max(5_600_000),
  }).strict()).max(3).optional(),
  // Rounded location for "near me" searches. Never stored by the run.
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    city: z.string().trim().max(80).optional(),
    zip: z.string().trim().regex(/^\d{5}$/).optional(),
  }).optional(),
})
export type RunRequest = z.infer<typeof RunRequest>
