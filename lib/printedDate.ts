// Converts a date as printed on a lab report ("10/14/2026", "2026-10-14",
// "Oct 14, 2026", "14-Oct-2026") to YYYY-MM-DD. Code does the conversion so a
// model never "corrects" a year it thinks is in the future.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1
const pad = (n: number) => String(n).padStart(2, "0")

export function parsePrintedDate(text: unknown, now = new Date()): string | null {
  if (typeof text !== "string" || !text.trim()) return null
  const value = text.trim()
  let y = 0, m = 0, d = 0
  let match: RegExpMatchArray | null
  if ((match = value.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/))) {
    // US lab reports print month first.
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (match[3].length === 2) y += y <= now.getFullYear() % 100 ? 2000 : 1900
  } else if ((match = value.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/))) {
    [m, d, y] = [month(match[1]), Number(match[2]), Number(match[3])]
  } else if ((match = value.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s-,]+(\d{4})\b/))) {
    [d, m, y] = [Number(match[1]), month(match[2]), Number(match[3])]
  } else {
    return null
  }
  if (y < 1900 || m < 1 || m > 12 || d < 1) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}
