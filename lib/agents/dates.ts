// Date helpers that work on the person's local wall-clock values.
// Local dates are "YYYY-MM-DD"; local date-times are "YYYY-MM-DDTHH:MM".

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

const pad = (n: number) => String(n).padStart(2, "0")

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false
  const [, y, m, d] = value.match(DATE)!.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function isLocalDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !DATETIME.test(value)) return false
  const [, , , , h, mi] = value.match(DATETIME)!.map(Number)
  return isLocalDate(value.slice(0, 10)) && h < 24 && mi < 60
}

export function addDays(localDate: string, days: number): string {
  const [, y, m, d] = localDate.match(DATE)!.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Adds minutes to a local wall-clock date-time without any time zone conversion. */
export function addMinutesLocal(localDateTime: string, minutes: number): string {
  const [, y, m, d, h, mi] = localDateTime.match(DATETIME)!.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, h, mi + minutes))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/**
 * Converts a local wall-clock time to a UTC ISO timestamp using the browser's
 * Date#getTimezoneOffset value (minutes; positive west of UTC).
 */
export function localToUtcIso(localDateTime: string, tzOffsetMinutes: number): string {
  const [, y, m, d, h, mi] = localDateTime.match(DATETIME)!.map(Number)
  return new Date(Date.UTC(y, m - 1, d, h, mi) + tzOffsetMinutes * 60_000).toISOString()
}

export const REFILL_LEAD_DAYS = 5

/** Deterministic refill timing so the model never does date arithmetic. */
export function refillDates(today: string, supplyRemaining: number, dosesPerDay: number) {
  if (!isLocalDate(today) || !(supplyRemaining >= 0) || !(dosesPerDay > 0)) return null
  const daysLeft = Math.floor(supplyRemaining / dosesPerDay)
  return {
    days_left: daysLeft,
    runs_out_on: addDays(today, daysLeft),
    remind_on: addDays(today, Math.max(0, daysLeft - REFILL_LEAD_DAYS)),
  }
}

export function formatLocalDateTime(localDateTime: string): string {
  if (!isLocalDateTime(localDateTime)) return localDateTime
  const [, y, m, d, h, mi] = localDateTime.match(DATETIME)!.map(Number)
  return new Date(y, m - 1, d, h, mi).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatLocalDate(localDate: string): string {
  if (!isLocalDate(localDate)) return localDate
  const [, y, m, d] = localDate.match(DATE)!.map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

export function formatClock(hhmm: string): string {
  const match = hhmm.match(/^(\d{2}):(\d{2})$/)
  if (!match) return hhmm
  const h = Number(match[1]), mi = match[2]
  return `${((h + 11) % 12) + 1}:${mi} ${h < 12 ? "AM" : "PM"}`
}

/** The browser's current local wall-clock time as "YYYY-MM-DDTHH:MM". */
export function localNow(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
