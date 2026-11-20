import { z } from 'zod'

// Things the person tells the guide about themselves ("I slept 11 to 6:30",
// "I started metformin 500 mg") come back as structured actions. The native
// app writes them to the person's own account with their session (row-level
// security), then shows "Saved" with Undo. The server never writes them.

const isoLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const name = z.string().trim().min(1).max(120)
const grams = z.number().finite().min(0).max(2000)

export const ChatActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log_sleep'),
    bedtime: isoLocal,
    wake_time: isoLocal,
    minutes_to_fall_asleep: z.number().int().min(0).max(300).optional(),
    wakeups: z.number().int().min(0).max(50).optional(),
    minutes_awake: z.number().int().min(0).max(600).optional(),
    quality_1_5: z.number().int().min(1).max(5).optional(),
  }).strict(),
  z.object({ type: z.literal('log_stress'), rating_1_10: z.number().int().min(1).max(10) }).strict(),
  z.object({
    type: z.literal('log_meal'),
    name,
    kcal: z.number().finite().min(0).max(10000).optional(),
    protein_g: grams.optional(),
    carbs_g: grams.optional(),
    fat_g: grams.optional(),
    fiber_g: grams.optional(),
  }).strict(),
  z.object({ type: z.literal('log_water'), ml: z.number().finite().min(1).max(10000) }).strict(),
  z.object({
    type: z.literal('log_vital'),
    kind: z.enum(['weight', 'blood_pressure', 'resting_hr', 'hrv', 'temperature']),
    value: z.number().finite().min(0).max(1000),
    value2: z.number().finite().min(0).max(1000).optional(),
  }).strict(),
  z.object({
    type: z.literal('add_medication'),
    name,
    dose: z.string().trim().max(80).optional(),
    frequency: z.string().trim().max(80).optional(),
    started_on: isoDate.optional(),
  }).strict(),
  z.object({ type: z.literal('stop_medication'), name }).strict(),
  z.object({ type: z.literal('add_condition'), name, diagnosed_on: isoDate.optional() }).strict(),
  z.object({
    type: z.literal('add_lab'),
    name,
    value: z.union([z.number().finite(), z.string().trim().min(1).max(40)]),
    unit: z.string().trim().max(40).optional(),
    range: z.string().trim().max(80).optional(),
    date: isoDate.optional(),
  }).strict(),
])

export type ChatAction = z.infer<typeof ChatActionSchema>

const MAX_ACTIONS = 12

/** Instructions that let the model record facts the person states about themselves. */
export function actionsPrompt(now?: string, tz?: string): string {
  const clock = now ? `The person's local time is ${now}${tz ? ` (${tz})` : ''}. Resolve "last night", "this morning", "yesterday" and similar from that.` : 'If a time is relative and you cannot resolve it, ask instead of guessing.'
  return `You can save things to the person's Healyx account. When they clearly state a fact about themselves that belongs in their record, save it by ending your reply with a fenced block exactly like this (a JSON array, one object per thing to save):
\`\`\`healyx-actions
[{"type":"log_sleep","bedtime":"2026-11-19T23:00","wake_time":"2026-11-20T06:30"}]
\`\`\`
Types and fields (times are local ISO "YYYY-MM-DDTHH:MM", dates "YYYY-MM-DD"; leave out unknown optional fields):
- log_sleep {bedtime, wake_time, minutes_to_fall_asleep?, wakeups?, minutes_awake?, quality_1_5?}
- log_stress {rating_1_10}
- log_meal {name, kcal?, protein_g?, carbs_g?, fat_g?, fiber_g?} (estimate calories and macros for common foods when they don't give them)
- log_water {ml} (1 cup = 240 ml, 1 oz = 30 ml, a bottle = 500 ml)
- log_vital {kind: weight|blood_pressure|resting_hr|hrv|temperature, value, value2?} (weight in lb, blood pressure as value systolic and value2 diastolic, temperature in F)
- add_medication {name, dose?, frequency?, started_on?}
- stop_medication {name}
- add_condition {name, diagnosed_on?}
- add_lab {name, value, unit?, range?, date?}
${clock}
Only save what they actually said about themselves just now. Never save guesses, hypotheticals, questions ("should I take...?"), or things about other people. If something important is missing (like the dose they started), save what you have and ask. In your visible reply, mention what you saved in one short phrase (for example "Logged your sleep."). Never mention or show this block.`
}

/** Pulls the hidden healyx-actions block out of a reply and keeps only valid actions. */
export function splitActions(reply: string): { reply: string; actions: ChatAction[] } {
  const match = /```healyx-actions\s*([\s\S]*?)```/i.exec(reply)
  if (!match) return { reply, actions: [] }
  let actions: ChatAction[] = []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, MAX_ACTIONS)) {
        const result = ChatActionSchema.safeParse(item)
        if (result.success && isSensible(result.data)) actions.push(result.data)
      }
    }
  } catch { actions = [] }
  return { reply: reply.replace(match[0], '').trim(), actions }
}

/** Rejects actions that parse but make no sense (a night of sleep that ends before it starts). */
function isSensible(action: ChatAction): boolean {
  if (action.type === 'log_sleep') {
    const start = Date.parse(action.bedtime)
    const end = Date.parse(action.wake_time)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    const hours = (end - start) / 3_600_000
    return hours > 0 && hours <= 24
  }
  if (action.type === 'log_vital' && action.kind === 'blood_pressure') {
    return action.value2 === undefined || action.value > action.value2
  }
  return true
}
