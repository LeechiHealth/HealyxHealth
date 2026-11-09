// Builds calendar files (RFC 5545) and Google Calendar links for reminders.
// Times are "floating" local times so the person's calendar applies its own zone.

import { addMinutesLocal, isLocalDateTime } from "./dates"

export interface CalendarEvent {
  uid: string
  title: string
  /** Local wall-clock start, "YYYY-MM-DDTHH:MM". */
  start: string
  durationMinutes?: number
  description?: string
  location?: string
  /** RRULE value without the "RRULE:" prefix, e.g. "FREQ=DAILY". */
  rrule?: string
  /** Minutes before the start to alert. 0 alerts at the start time. */
  alarmsMinutesBefore?: number[]
}

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const
export type Weekday = (typeof WEEKDAYS)[number]

export function recurrenceRule(days: readonly string[] = []): string {
  const valid = WEEKDAYS.filter(day => days.includes(day))
  return valid.length === 0 || valid.length === 7 ? "FREQ=DAILY" : `FREQ=WEEKLY;BYDAY=${valid.join(",")}`
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

const encoder = new TextEncoder()

/** Folds a content line to 75 octets, continuing with CRLF + space. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ""
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) { parts.push(current); current = ""; bytes = 0 }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join("\r\n ")
}

const compact = (local: string) => `${local.replace(/[-:]/g, "")}00`
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

function trigger(minutesBefore: number): string {
  if (minutesBefore <= 0) return "PT0S"
  if (minutesBefore % 1440 === 0) return `-P${minutesBefore / 1440}D`
  return `-PT${minutesBefore}M`
}

export function buildIcs(events: CalendarEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Healyx//Health Agents//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
  for (const event of events) {
    if (!isLocalDateTime(event.start)) throw new Error("Invalid event start")
    const end = addMinutesLocal(event.start, event.durationMinutes ?? 15)
    lines.push("BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${compact(event.start)}`, `DTEND:${compact(end)}`, `SUMMARY:${escapeText(event.title)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.rrule) lines.push(`RRULE:${event.rrule}`)
    for (const minutes of event.alarmsMinutesBefore ?? []) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.title)}`, `TRIGGER:${trigger(minutes)}`, "END:VALARM")
    }
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.map(foldLine).join("\r\n") + "\r\n"
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const end = addMinutesLocal(event.start, event.durationMinutes ?? 15)
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${compact(event.start)}/${compact(end)}` })
  if (event.description) params.set("details", event.description)
  if (event.location) params.set("location", event.location)
  if (event.rrule) params.set("recur", `RRULE:${event.rrule}`)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Triggers a browser download of an .ics file. Client-side only. */
export function downloadIcs(filename: string, events: CalendarEvent[]) {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".ics") ? filename : `${filename}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
