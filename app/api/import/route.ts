import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VitalEntry {
  type: string
  value: number
  unit: string
  recorded_at: string
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim()
    })
    rows.push(row)
  }
  return rows
}

function safeDate(str: string): string | null {
  try {
    const d = new Date(str)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fitbit CSV parser
// Fitbit exports one CSV per data type; we detect by filename.
// ---------------------------------------------------------------------------
function parseFitbitCSV(text: string, filename: string): VitalEntry[] {
  const rows = parseCSV(text)
  const entries: VitalEntry[] = []
  const lname = filename.toLowerCase()

  for (const row of rows) {
    const dateRaw =
      row['Date'] ?? row['date'] ?? row['timestamp'] ?? row['Time'] ?? row['dateTime'] ?? ''
    const dateStr = safeDate(dateRaw)
    if (!dateStr) continue

    if (lname.includes('heart_rate') || lname.includes('heart-rate')) {
      const v = parseFloat(row['Heart Rate'] ?? row['heart_rate'] ?? row['value'] ?? '')
      if (!isNaN(v)) entries.push({ type: 'heart_rate', value: v, unit: 'bpm', recorded_at: dateStr })
    }

    if (lname.includes('weight') || lname.includes('body')) {
      const w = parseFloat(row['Weight'] ?? row['weight'] ?? '')
      const bmi = parseFloat(row['BMI'] ?? row['bmi'] ?? '')
      const fat = parseFloat(row['Fat'] ?? row['fat'] ?? '')
      if (!isNaN(w) && w > 0) entries.push({ type: 'weight', value: w, unit: 'lbs', recorded_at: dateStr })
      if (!isNaN(bmi) && bmi > 0) entries.push({ type: 'bmi', value: bmi, unit: 'kg/m²', recorded_at: dateStr })
      if (!isNaN(fat) && fat > 0) entries.push({ type: 'body_fat', value: fat, unit: '%', recorded_at: dateStr })
    }

    if (lname.includes('step')) {
      const v = parseFloat(
        row['Steps'] ?? row['steps'] ?? row['Activities Steps'] ?? row['value'] ?? ''
      )
      if (!isNaN(v) && v > 0) entries.push({ type: 'steps', value: v, unit: 'steps', recorded_at: dateStr })
    }

    if (lname.includes('sleep')) {
      const score = parseFloat(row['overall_score'] ?? row['score'] ?? row['Sleep Score'] ?? '')
      const duration = parseFloat(row['minutesAsleep'] ?? row['duration'] ?? '')
      if (!isNaN(score) && score > 0) entries.push({ type: 'sleep_score', value: score, unit: 'score', recorded_at: dateStr })
      if (!isNaN(duration) && duration > 0) entries.push({ type: 'sleep_duration', value: Math.round(duration / 60 * 10) / 10, unit: 'hrs', recorded_at: dateStr })
    }

    if (lname.includes('calories')) {
      const v = parseFloat(row['Calories Burned'] ?? row['calories'] ?? row['value'] ?? '')
      if (!isNaN(v) && v > 0) entries.push({ type: 'calories', value: v, unit: 'kcal', recorded_at: dateStr })
    }

    if (lname.includes('distance')) {
      const v = parseFloat(row['Distance'] ?? row['distance'] ?? row['value'] ?? '')
      if (!isNaN(v) && v > 0) entries.push({ type: 'distance', value: v, unit: 'mi', recorded_at: dateStr })
    }
  }

  // Generic fallback: try to read any numeric column
  if (entries.length === 0) {
    for (const row of rows) {
      const dateRaw = row['Date'] ?? row['date'] ?? row['timestamp'] ?? ''
      const dateStr = safeDate(dateRaw)
      if (!dateStr) continue
      for (const [key, val] of Object.entries(row)) {
        if (/date|time|name|label|source|id/i.test(key)) continue
        const num = parseFloat(val)
        if (!isNaN(num) && val.length > 0) {
          entries.push({
            type: key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
            value: num,
            unit: '',
            recorded_at: dateStr,
          })
        }
      }
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Apple Health XML parser
// Parses <Record ...> elements via regex (no DOM required in Node.js).
// ---------------------------------------------------------------------------
const APPLE_HEALTH_TYPE_MAP: Record<string, string> = {
  HKQuantityTypeIdentifierHeartRate: 'heart_rate',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_heart_rate',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierBodyMassIndex: 'bmi',
  HKQuantityTypeIdentifierLeanBodyMass: 'lean_body_mass',
  HKQuantityTypeIdentifierBodyFatPercentage: 'body_fat',
  HKQuantityTypeIdentifierBloodPressureSystolic: 'blood_pressure_systolic',
  HKQuantityTypeIdentifierBloodPressureDiastolic: 'blood_pressure_diastolic',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierOxygenSaturation: 'oxygen_saturation',
  HKQuantityTypeIdentifierBodyTemperature: 'temperature',
  HKQuantityTypeIdentifierBloodGlucose: 'glucose',
  HKQuantityTypeIdentifierVO2Max: 'vo2_max',
  HKQuantityTypeIdentifierRespiratoryRate: 'respiratory_rate',
  HKQuantityTypeIdentifierFlightsClimbed: 'flights_climbed',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active_calories',
  HKQuantityTypeIdentifierBasalEnergyBurned: 'resting_calories',
}

function parseAppleHealthXML(xml: string): VitalEntry[] {
  const entries: VitalEntry[] = []
  // Process in chunks to avoid excessive memory allocation
  const MAX_XML = 8_000_000 // 8 MB
  const xmlChunk = xml.length > MAX_XML ? xml.slice(0, MAX_XML) : xml

  const recordRe = /<Record\b([^>]+)>/g
  let m: RegExpExecArray | null
  const attrRe = /(\w+)="([^"]*)"/g

  while ((m = recordRe.exec(xmlChunk)) !== null) {
    const attrs: Record<string, string> = {}
    let am: RegExpExecArray | null
    attrRe.lastIndex = 0
    while ((am = attrRe.exec(m[1])) !== null) attrs[am[1]] = am[2]

    const hkType = attrs['type']
    const mapped = APPLE_HEALTH_TYPE_MAP[hkType]
    if (!mapped) continue

    const valStr = attrs['value']
    const unit = attrs['unit'] || ''
    const startDate = safeDate(attrs['startDate'] || attrs['creationDate'] || '')
    if (!valStr || !startDate) continue

    let value = parseFloat(valStr)
    if (isNaN(value)) continue

    // Normalize oxygen saturation 0-1 → 0-100
    if (hkType === 'HKQuantityTypeIdentifierOxygenSaturation' && value <= 1) value = Math.round(value * 1000) / 10

    // Normalize body fat % 0-1 → 0-100
    if (hkType === 'HKQuantityTypeIdentifierBodyFatPercentage' && value <= 1) value = Math.round(value * 1000) / 10

    let mappedUnit = unit
    if (unit === 'count/min') mappedUnit = 'bpm'
    else if (unit === 'count') mappedUnit = unit === 'steps' ? 'steps' : 'count'

    entries.push({ type: mapped, value, unit: mappedUnit, recorded_at: startDate })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Oura CSV parser
// ---------------------------------------------------------------------------
function parseOuraCSV(text: string, filename: string): VitalEntry[] {
  const rows = parseCSV(text)
  const entries: VitalEntry[] = []
  const lname = filename.toLowerCase()

  for (const row of rows) {
    const dateRaw = row['date'] ?? row['Day'] ?? row['summary_date'] ?? row['timestamp'] ?? ''
    const dateStr = safeDate(dateRaw)
    if (!dateStr) continue

    if (lname.includes('heart_rate') || lname.includes('heart-rate')) {
      const v = parseFloat(row['average'] ?? row['Average Heart Rate'] ?? row['bpm'] ?? '')
      if (!isNaN(v) && v > 0) entries.push({ type: 'resting_heart_rate', value: v, unit: 'bpm', recorded_at: dateStr })
    }

    if (lname.includes('sleep')) {
      const score = parseFloat(row['Score'] ?? row['score'] ?? row['Sleep Score'] ?? '')
      const hrv = parseFloat(row['Average HRV'] ?? row['hrv_average'] ?? row['average_hrv'] ?? '')
      const dur = parseFloat(row['Total Sleep Duration'] ?? row['total_sleep_duration'] ?? '')
      if (!isNaN(score) && score > 0) entries.push({ type: 'sleep_score', value: score, unit: 'score', recorded_at: dateStr })
      if (!isNaN(hrv) && hrv > 0) entries.push({ type: 'hrv', value: hrv, unit: 'ms', recorded_at: dateStr })
      if (!isNaN(dur) && dur > 0) entries.push({ type: 'sleep_duration', value: Math.round(dur / 3600 * 10) / 10, unit: 'hrs', recorded_at: dateStr })
    }

    if (lname.includes('readiness')) {
      const score = parseFloat(row['Score'] ?? row['score'] ?? row['Readiness Score'] ?? '')
      if (!isNaN(score) && score > 0) entries.push({ type: 'readiness_score', value: score, unit: 'score', recorded_at: dateStr })
    }

    if (lname.includes('activity') || lname.includes('daily_activity')) {
      const steps = parseFloat(row['Steps'] ?? row['steps'] ?? row['step_counter'] ?? '')
      const cals = parseFloat(row['Active Calories'] ?? row['active_calories'] ?? row['cal_active'] ?? '')
      if (!isNaN(steps) && steps > 0) entries.push({ type: 'steps', value: steps, unit: 'steps', recorded_at: dateStr })
      if (!isNaN(cals) && cals > 0) entries.push({ type: 'active_calories', value: cals, unit: 'kcal', recorded_at: dateStr })
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Withings CSV parser
// ---------------------------------------------------------------------------
function parseWithingsCSV(text: string): VitalEntry[] {
  const rows = parseCSV(text)
  const entries: VitalEntry[] = []

  for (const row of rows) {
    const dateRaw = row['Date'] ?? row['date'] ?? row['measurement_date'] ?? ''
    const dateStr = safeDate(dateRaw)
    if (!dateStr) continue

    const weight = parseFloat(row['Weight (kg)'] ?? row['Weight'] ?? row['weight'] ?? '')
    const bmi = parseFloat(row['BMI'] ?? row['bmi'] ?? '')
    const fat = parseFloat(row['Fat mass (%)'] ?? row['fat_mass_percent'] ?? row['Body Fat'] ?? '')
    const systolic = parseFloat(row['Systolic (mmHg)'] ?? row['systolic'] ?? row['Systolic'] ?? '')
    const diastolic = parseFloat(row['Diastolic (mmHg)'] ?? row['diastolic'] ?? row['Diastolic'] ?? '')
    const hr = parseFloat(row['Heart Rate (bpm)'] ?? row['heart_rate'] ?? row['Heart Rate'] ?? row['Pulse (bpm)'] ?? '')
    const temp = parseFloat(row['Temperature (°C)'] ?? row['temperature'] ?? '')

    if (!isNaN(weight) && weight > 0) entries.push({ type: 'weight', value: weight, unit: 'kg', recorded_at: dateStr })
    if (!isNaN(bmi) && bmi > 0) entries.push({ type: 'bmi', value: bmi, unit: 'kg/m²', recorded_at: dateStr })
    if (!isNaN(fat) && fat > 0) entries.push({ type: 'body_fat', value: fat, unit: '%', recorded_at: dateStr })
    if (!isNaN(systolic) && systolic > 0) {
      entries.push({ type: 'blood_pressure_systolic', value: systolic, unit: 'mmHg', recorded_at: dateStr })
      if (!isNaN(diastolic) && diastolic > 0) entries.push({ type: 'blood_pressure_diastolic', value: diastolic, unit: 'mmHg', recorded_at: dateStr })
    }
    if (!isNaN(hr) && hr > 0) entries.push({ type: 'heart_rate', value: hr, unit: 'bpm', recorded_at: dateStr })
    if (!isNaN(temp) && temp > 0) entries.push({ type: 'temperature', value: temp, unit: '°C', recorded_at: dateStr })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Google Fit JSON (Takeout) parser
// ---------------------------------------------------------------------------
function parseGoogleFitJSON(text: string): VitalEntry[] {
  const entries: VitalEntry[] = []
  try {
    const json = JSON.parse(text)
    const dataPoints: any[] = json?.bucket?.flatMap((b: any) => b.dataset?.flatMap((d: any) => d.point || []) || []) || json?.point || []

    for (const pt of dataPoints) {
      const typeId: string = pt.dataTypeName || ''
      const startNs: number = parseInt(pt.startTimeNanos || '0', 10)
      if (!startNs) continue
      const dateStr = new Date(startNs / 1e6).toISOString()

      for (const fp of pt.value || []) {
        const v = fp.fpVal ?? fp.intVal
        if (v === undefined || v === null) continue
        const num = parseFloat(v)
        if (isNaN(num)) continue

        if (typeId.includes('heart_rate')) entries.push({ type: 'heart_rate', value: num, unit: 'bpm', recorded_at: dateStr })
        else if (typeId.includes('weight')) entries.push({ type: 'weight', value: num, unit: 'kg', recorded_at: dateStr })
        else if (typeId.includes('step')) entries.push({ type: 'steps', value: num, unit: 'steps', recorded_at: dateStr })
        else if (typeId.includes('calories')) entries.push({ type: 'calories', value: num, unit: 'kcal', recorded_at: dateStr })
        else if (typeId.includes('oxygen_saturation')) entries.push({ type: 'oxygen_saturation', value: num, unit: '%', recorded_at: dateStr })
        else if (typeId.includes('blood_pressure.systolic')) entries.push({ type: 'blood_pressure_systolic', value: num, unit: 'mmHg', recorded_at: dateStr })
        else if (typeId.includes('blood_pressure.diastolic')) entries.push({ type: 'blood_pressure_diastolic', value: num, unit: 'mmHg', recorded_at: dateStr })
      }
    }
  } catch {
    // Not valid JSON or unexpected shape
  }
  return entries
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createServerClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Could not read form data' }, { status: 400 })
  }

  const service = (formData.get('service') as string || '').toLowerCase().trim()
  const file = formData.get('file') as File | null

  if (!service || !file) return NextResponse.json({ error: 'Missing service or file' }, { status: 400 })

  const VALID_SERVICES = ['fitbit', 'apple_health', 'oura', 'withings', 'google_fit']
  if (!VALID_SERVICES.includes(service)) return NextResponse.json({ error: 'Unknown service' }, { status: 400 })

  // Size check — 15 MB max
  if (file.size > 15_000_000) return NextResponse.json({ error: 'File too large (max 15 MB). For Apple Health, export a shorter date range.' }, { status: 413 })

  const filename = file.name || ''
  let text: string
  try {
    text = await file.text()
  } catch {
    return NextResponse.json({ error: 'Could not read file' }, { status: 400 })
  }

  // Parse
  let entries: VitalEntry[] = []
  try {
    switch (service) {
      case 'fitbit':
        entries = parseFitbitCSV(text, filename)
        break
      case 'apple_health':
        entries = parseAppleHealthXML(text)
        break
      case 'oura':
        entries = parseOuraCSV(text, filename)
        break
      case 'withings':
        entries = parseWithingsCSV(text)
        break
      case 'google_fit':
        entries = parseGoogleFitJSON(text)
        break
    }
  } catch (err) {
    console.error(`[import] parse error (${service}):`, err)
    return NextResponse.json({ error: 'Could not parse file. Make sure you uploaded the correct export file.' }, { status: 422 })
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No recognizable data found in this file. Check the export instructions and try again.' }, { status: 422 })
  }

  // Deduplicate within the batch
  const seen = new Set<string>()
  const unique = entries.filter(e => {
    const key = `${e.type}|${e.recorded_at}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Insert in batches of 200
  // Try upsert first (works if unique constraint exists on user_id,type,recorded_at).
  // Fall back to plain insert if that constraint is missing.
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH).map(e => ({
      user_id: user.id,
      type: e.type,
      value: e.value,
      unit: e.unit,
      recorded_at: e.recorded_at,
    }))

    const { error: upsertErr } = await supabase
      .from('vitals')
      .upsert(batch, { onConflict: 'user_id,type,recorded_at', ignoreDuplicates: true })

    if (!upsertErr) {
      inserted += batch.length
    } else {
      // Fallback: plain insert (no dedup — acceptable for first-time imports)
      const { error: insertErr } = await supabase.from('vitals').insert(batch)
      if (!insertErr) {
        inserted += batch.length
      } else {
        // Last resort: row-by-row to maximise success
        for (const row of batch) {
          const { error: rowErr } = await supabase.from('vitals').insert(row)
          if (!rowErr) inserted++
        }
      }
    }
  }

  return NextResponse.json({ success: true, inserted, total: unique.length })
}
