// ─────────────────────────────────────────────────────────────────────────────
// Healyx Health Score
//
// Based on the American Heart Association's **Life's Essential 8 (LE8)** — a
// peer-reviewed, validated 0–100 composite of cardiovascular/metabolic health.
// It blends 4 OBJECTIVE measured factors (blood pressure, lipids, blood glucose,
// body weight) with 4 SUBJECTIVE behaviors (physical activity, sleep, nicotine,
// diet). Each component is scored 0–100 on AHA bands; the overall score is the
// unweighted average of the components we actually have data for (the published
// LE8 incomplete-data method). High 80–100, moderate 50–79, low 0–49.
//
// Sources: AHA Life's Essential 8 (Circulation 2022); LE8 incomplete-data
// estimation (medRxiv 2023). This is wellness scoring, not a diagnostic device.
// ─────────────────────────────────────────────────────────────────────────────

export type Component = { key: string; label: string; kind: "measured" | "behavior"; score: number | null }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export const scoreBMI = (bmi?: number | null) =>
  bmi == null ? null : bmi < 25 ? 100 : bmi < 30 ? 70 : bmi < 35 ? 30 : bmi < 40 ? 15 : 0

export function scoreBP(sys?: number | null, dia?: number | null) {
  if (sys == null && dia == null) return null
  const s = sys ?? 0, d = dia ?? 0
  if (s < 120 && d < 80) return 100
  if (s < 130 && d < 80) return 75
  if ((s >= 130 && s < 140) || (d >= 80 && d < 90)) return 50
  if ((s >= 140 && s < 160) || (d >= 90 && d < 100)) return 25
  return 0
}

export function scoreGlucose(hba1c?: number | null, fasting?: number | null) {
  if (hba1c != null) {
    if (hba1c < 5.7) return 100
    if (hba1c < 6.5) return 60
    if (hba1c < 7) return 40
    if (hba1c < 8) return 30
    if (hba1c < 9) return 20
    if (hba1c < 10) return 10
    return 0
  }
  if (fasting != null) {
    if (fasting < 100) return 100
    if (fasting < 126) return 60
    if (fasting < 160) return 40
    if (fasting < 200) return 20
    return 0
  }
  return null
}

export const scoreLipids = (nonHDL?: number | null) =>
  nonHDL == null ? null : nonHDL < 130 ? 100 : nonHDL < 160 ? 60 : nonHDL < 190 ? 40 : nonHDL < 220 ? 20 : 0

export function scoreSleep(hrs?: number | null) {
  if (hrs == null) return null
  if (hrs >= 7 && hrs < 9) return 100
  if (hrs >= 9 && hrs < 10) return 90
  if (hrs >= 6 && hrs < 7) return 70
  if (hrs >= 5 && hrs < 6) return 40
  if (hrs >= 4 && hrs < 5) return 20
  return 0
}

export function scoreActivity(minPerWeek?: number | null) {
  if (minPerWeek == null) return null
  if (minPerWeek >= 150) return 100
  if (minPerWeek >= 120) return 90
  if (minPerWeek >= 90) return 80
  if (minPerWeek >= 60) return 60
  if (minPerWeek >= 30) return 40
  if (minPerWeek >= 1) return 20
  return 0
}

export function scoreNicotine(status?: string | null) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s.includes("never")) return 100
  if (s.includes("former") || s.includes("quit")) return 75
  if (s.includes("current") || s.includes("smok") || s.includes("vap")) return 0
  return null
}

export interface HealthInputs {
  bmi?: number | null
  systolic?: number | null
  diastolic?: number | null
  hba1c?: number | null
  fastingGlucose?: number | null
  nonHDL?: number | null
  sleepHours?: number | null
  activityMinutes?: number | null
  nicotine?: string | null
}

export function computeHealthScore(input: HealthInputs) {
  const components: Component[] = [
    { key: "bp", label: "Blood pressure", kind: "measured", score: scoreBP(input.systolic, input.diastolic) },
    { key: "lipids", label: "Cholesterol", kind: "measured", score: scoreLipids(input.nonHDL) },
    { key: "glucose", label: "Blood sugar", kind: "measured", score: scoreGlucose(input.hba1c, input.fastingGlucose) },
    { key: "bmi", label: "Body weight", kind: "measured", score: scoreBMI(input.bmi) },
    { key: "activity", label: "Activity", kind: "behavior", score: scoreActivity(input.activityMinutes) },
    { key: "sleep", label: "Sleep", kind: "behavior", score: scoreSleep(input.sleepHours) },
    { key: "nicotine", label: "Nicotine", kind: "behavior", score: scoreNicotine(input.nicotine) },
  ]
  const present = components.filter(c => c.score != null)
  const score = present.length ? clamp(present.reduce((a, c) => a + (c.score as number), 0) / present.length) : 0
  const grade = score >= 80 ? "Good" : score >= 50 ? "Fair" : score > 0 ? "Needs work" : "—"
  // weakest measured components, for "what's dragging the score"
  const weakest = present.filter(c => (c.score as number) < 60).sort((a, b) => (a.score as number) - (b.score as number))
  return { score, grade, components, present, weakest, measured: present.length, total: components.length }
}
