export interface HealthRecord {
  id: string
  name: string
  value: number | string | null
  unit?: string | null
  test_date?: string | null
  status?: string | null
  reference_range_text?: string | null
  [key: string]: unknown
}
export type HealthClassification = 'in-range' | 'flagged' | 'unknown'
export type BriefRecord = HealthRecord & { classification: HealthClassification; change: string | null; dateLabel: string; dateVerified: boolean }

const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
export function recordedClassification(status: unknown): HealthClassification {
  if (typeof status !== 'string') return 'unknown'
  const normalized = key(status).replace(/[_ ]/g, '-')
  if (['normal', 'optimal', 'in-range', 'within-range'].includes(normalized)) return 'in-range'
  if (['high', 'low', 'borderline', 'critical', 'out-of-range', 'abnormal'].includes(normalized)) return 'flagged'
  return 'unknown'
}
function dated(value: unknown, now: Date): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null
  if (value.includes('T') && !Number.isFinite(Date.parse(value))) return null
  const day = value.slice(0, 10)
  const date = new Date(`${day}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || day > now.toISOString().slice(0, 10)) return null
  return date.getTime()
}
function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}
export function buildHealthBrief(records: readonly HealthRecord[], now = new Date()) {
  const groups = new Map<string, HealthRecord[]>()
  for (const row of records) {
    if (typeof row.name !== 'string' || !row.name.trim()) continue
    const name = key(row.name)
    groups.set(name, [...(groups.get(name) || []), row])
  }
  let lastRecorded: string | null = null
  const latest: BriefRecord[] = []
  for (const rows of groups.values()) {
    const sorted = [...rows].sort((a, b) => (dated(b.test_date, now) ?? -Infinity) - (dated(a.test_date, now) ?? -Infinity))
    const row = sorted[0]
    const date = dated(row.test_date, now)
    const day = date == null ? null : row.test_date!.slice(0, 10)
    if (day && (!lastRecorded || day > lastRecorded)) lastRecorded = day
    const sameDay = date == null ? [] : sorted.filter(r => dated(r.test_date, now) === date)
    const conflict = sameDay.some(r => String(r.value) !== String(row.value) || r.unit !== row.unit || recordedClassification(r.status) !== recordedClassification(row.status))
    let change: string | null = null
    if (date != null && !conflict && row.unit?.trim()) {
      const previous = sorted.find(r => { const d = dated(r.test_date, now); return d != null && d < date })
      if (previous && previous.unit?.trim() === row.unit.trim()) {
        const prevDate = dated(previous.test_date, now)
        const priorConflict = sorted.some(r => dated(r.test_date, now) === prevDate && (String(r.value) !== String(previous.value) || r.unit !== previous.unit))
        const currentValue = numeric(row.value), previousValue = numeric(previous.value)
        if (!priorConflict && currentValue != null && previousValue != null) {
          const delta = currentValue - previousValue
          change = `${delta === 0 ? 'Unchanged' : `${delta > 0 ? 'Up' : 'Down'} ${Number(Math.abs(delta).toPrecision(4))} ${row.unit.trim()}`} since ${previous.test_date!.slice(0, 10)}`
        }
      }
    }
    latest.push({ ...row, classification: date == null || conflict ? 'unknown' : recordedClassification(row.status), change, dateVerified: date != null, dateLabel: conflict ? `${day} · conflicting entries` : day ?? 'Date needs verification' })
  }
  return { latest, inRange: latest.filter(r => r.classification === 'in-range').length, flagged: latest.filter(r => r.classification === 'flagged').length, unknown: latest.filter(r => r.classification === 'unknown').length, lastRecorded, undatedCount: records.filter(r => dated(r.test_date, now) == null).length }
}
