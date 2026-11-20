// Deterministic guardrails that run regardless of what the model returns.

export type UrgentKind = "emergency" | "crisis"

const CRISIS = [
  /\b(kill(ing)? myself|end(ing)? my life|take my (own )?life|want to die|wanna die|hurt(ing)? myself|self[- ]harm(ing)?)\b/i,
  /\b(i('| a)?m|i feel|feeling|i've been)\s+(really\s+|so\s+)?suicidal\b/i,
  /\bthinking (about|of) (suicide|killing myself|ending it)\b/i,
]

const FIRST_PERSON = String.raw`\b(i|i'm|im|i am|i've|ive|i have|my|me)\b`
const EMERGENCY_SIGNS = String.raw`(chest pain|chest pressure|can'?t breathe|cannot breathe|trouble breathing|struggling to breathe|having a stroke|face (is )?drooping|slurred speech|passed out|unconscious|having (a )?seizures?|overdosed|overdosing|took too many|bleeding (heavily|a lot|won'?t stop)|throat (is )?(closing|swelling)|anaphyla\w*)`
const EMERGENCY = new RegExp(`${FIRST_PERSON}[^.?!]{0,60}${EMERGENCY_SIGNS}|${EMERGENCY_SIGNS}[^.?!]{0,30}\\b(right now|now|currently)\\b`, "i")

// Past events ("my dad had a seizure last year") are history, not an emergency.
const PAST = /\b(yesterday|last (night|week|month|year)|years? ago|months? ago|weeks? ago|history of|in the past|used to|when i was|back in)\b/i

export function detectUrgent(text: string): UrgentKind | null {
  if (CRISIS.some(pattern => pattern.test(text))) return "crisis"
  const sentences = text.split(/(?<=[.?!\n])\s+/)
  if (sentences.some(sentence => EMERGENCY.test(sentence) && !PAST.test(sentence))) return "emergency"
  return null
}

export const URGENT_REPLIES: Record<UrgentKind, string> = {
  emergency: "If this is happening now, it could be a medical emergency. Call 911 (or your local emergency number) or get to the nearest emergency room. Don't wait on a draft or an appointment.",
  crisis: "I'm really glad you said something. If you're thinking about ending your life or hurting yourself, please call or text 988 to reach the Suicide & Crisis Lifeline (US) now. If you're in immediate danger, call 911. You don't have to go through this alone.",
}

// Agents act on the person's own Healyx queue and memory without asking first, but they
// never send, book, call, pay or buy, so a reply that says otherwise is replaced rather than shown.
const OVERCLAIMS = [
  /\b(i|i've|i have|we|we've|we have|healyx has)\s+(already\s+|just\s+|now\s+|successfully\s+)?(booked|scheduled|sent|submitted|ordered|purchased|bought|paid|charged|called|faxed|emailed|messaged|contacted|notified|placed|requested|refilled|transferred|appealed|filed)\b/i,
  /\b(appointment|visit|refill|order|request|prescription|message|payment|bill|appeal|claim)\s+(has been|have been|is now)\s+(booked|scheduled|sent|submitted|placed|confirmed|ordered|paid|filed|on (its|the) way)\b/i,
  /\b(i('ll| will)|we('ll| will))\s+(call|email|message|contact|book|order|send|pay|buy|purchase)\b/i,
]

export const HONEST_FALLBACK_REPLY = "Here's what I prepared. Nothing has been sent, booked or bought. Review it in your queue and take the next step when you're ready."

/** Task kinds whose next step can cost the person money. The app shows "You confirm any payment" on them. */
export const SPENDING_KINDS = new Set(["bill_case", "rx_savings", "care_options", "shopping_list"])

/**
 * Agents never ask before acting, with one exception: anything that spends money.
 * No tool can pay or buy; tasks whose next step costs money are marked so the person confirms it.
 */
export function guardSpending<T extends { kind: string; payload: Record<string, unknown> }>(task: T): T {
  if (!SPENDING_KINDS.has(task.kind)) return task
  return { ...task, payload: { ...task.payload, confirm_before_spending: true } }
}

export function overclaims(text: string): boolean {
  return OVERCLAIMS.some(pattern => pattern.test(text))
}

export function honestReply(text: string): string {
  // Plain text only: bullets become "•", bold and heading marks are dropped.
  const cleaned = text.replace(/^[ \t]*[*-][ \t]+/gm, "• ").replace(/\*\*|__|^#+\s*/gm, "").replace(/\n{3,}/g, "\n\n").trim()
  if (!cleaned || overclaims(cleaned)) return HONEST_FALLBACK_REPLY
  return cleaned
}

/** Bracketed placeholders a person must fill in before sending a draft, e.g. "[Date of birth]". */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\[([^\]\n]{2,40})\]/g)].map(match => match[1].trim()))]
}
