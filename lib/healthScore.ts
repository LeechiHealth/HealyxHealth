// Healyx wellness indicator: a simplified, seven-factor adaptation inspired by
// AHA Life’s Essential 8. Diet is not collected; treatment/history adjustments
// are not implemented. This is NOT a validated LE8 score or overall health rating.
// Available components are equally weighted. Missing values are excluded.

export type Component = { key: string; label: string; kind: "measured" | "behavior"; score: number | null }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export const scoreBMI = (bmi?: number | null) =>
  bmi == null || !Number.isFinite(bmi) || bmi <= 0 ? null : bmi < 25 ? 100 : bmi < 30 ? 70 : bmi < 35 ? 30 : bmi < 40 ? 15 : 0

export function scoreBP(sys?: number | null, dia?: number | null) {
  if (sys == null || dia == null || !Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0) return null
  // The more severe of either reading determines the band.
  if (sys >= 160 || dia >= 100) return 0
  if (sys >= 140 || dia >= 90) return 25
  if (sys >= 130 || dia >= 80) return 50
  if (sys >= 120) return 75
  return 100
}

export function scoreGlucose(hba1c?: number | null, fasting?: number | null) {
  if (hba1c != null && Number.isFinite(hba1c) && hba1c > 0) {
    if (hba1c < 5.7) return 100
    if (hba1c < 6.5) return 60
    if (hba1c < 7) return 40
    if (hba1c < 8) return 30
    if (hba1c < 9) return 20
    if (hba1c < 10) return 10
    return 0
  }
  if (fasting != null && Number.isFinite(fasting) && fasting > 0) {
    if (fasting < 100) return 100
    if (fasting < 126) return 60
    if (fasting < 160) return 40
    if (fasting < 200) return 20
    return 0
  }
  return null
}

export const scoreLipids = (nonHDL?: number | null) =>
  nonHDL == null || !Number.isFinite(nonHDL) || nonHDL < 0 ? null : nonHDL < 130 ? 100 : nonHDL < 160 ? 60 : nonHDL < 190 ? 40 : nonHDL < 220 ? 20 : 0

export function scoreSleep(hrs?: number | null) {
  if (hrs == null || !Number.isFinite(hrs) || hrs < 0 || hrs > 24) return null
  if (hrs >= 7 && hrs < 9) return 100
  if (hrs >= 9 && hrs < 10) return 90
  if (hrs >= 6 && hrs < 7) return 70
  if (hrs >= 5 && hrs < 6) return 40
  if (hrs >= 4 && hrs < 5) return 20
  return 0
}

export function scoreActivity(minPerWeek?: number | null) {
  if (minPerWeek == null || !Number.isFinite(minPerWeek) || minPerWeek < 0) return null
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
  const present = components.filter(c => c.score != null && Number.isFinite(c.score))
  const score = present.length ? clamp(present.reduce((a, c) => a + (c.score as number), 0) / present.length) : 0
  const grade = !present.length ? "Not enough data" : score >= 80 ? "Higher range" : score >= 50 ? "Middle range" : "Lower range"
  // weakest measured components, for "what's dragging the score"
  const weakest = present.filter(c => (c.score as number) < 60).sort((a, b) => (a.score as number) - (b.score as number))
  return { score, grade, components, present, weakest, measured: present.length, total: components.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// PhenoAge — Levine et al. 2018 phenotypic age (biological age) clock.
// Inputs are US CONVENTIONAL units; we convert to the SI units the published
// coefficients require (albumin g/L, creatinine umol/L, glucose mmol/L,
// CRP mg/dL → ln). Source: Levine et al., Aging (Albany NY) 2018;10(4):573-591.
// ─────────────────────────────────────────────────────────────────────────────
export interface PhenoAgeLabs {
  ageYears: number
  albumin_gdl: number       // g/dL
  creatinine_mgdl: number   // mg/dL
  glucose_mgdl: number      // mg/dL (fasting)
  crp_mgl: number           // mg/L (hs-CRP)
  lymphocyte_pct: number    // %
  mcv_fl: number            // fL
  rdw_pct: number           // %
  alp_ul: number            // U/L (alkaline phosphatase)
  wbc_k: number             // 10^3 cells/uL
}

const PHENO_KEYS: (keyof PhenoAgeLabs)[] = [
  "ageYears", "albumin_gdl", "creatinine_mgdl", "glucose_mgdl", "crp_mgl",
  "lymphocyte_pct", "mcv_fl", "rdw_pct", "alp_ul", "wbc_k",
]

export function computePhenoAge(L: Partial<PhenoAgeLabs>): { phenoAge: number; delta: number; chronological: number } | null {
  for (const k of PHENO_KEYS) {
    const v = (L as any)[k]
    if (v == null || isNaN(Number(v))) return null
  }
  const albumin = Number(L.albumin_gdl) * 10                          // g/dL → g/L
  const creat = Number(L.creatinine_mgdl) * 88.4017                   // mg/dL → umol/L
  const glucose = Number(L.glucose_mgdl) * 0.0555                     // mg/dL → mmol/L
  const lnCRP = Math.log(Math.max(Number(L.crp_mgl) * 0.1, 0.01))     // mg/L → mg/dL, then ln (guarded)
  const age = Number(L.ageYears)

  const xb = -19.907
    - 0.0336 * albumin
    + 0.0095 * creat
    + 0.1953 * glucose
    + 0.0954 * lnCRP
    - 0.0120 * Number(L.lymphocyte_pct)
    + 0.0268 * Number(L.mcv_fl)
    + 0.3306 * Number(L.rdw_pct)
    + 0.00188 * Number(L.alp_ul)
    + 0.0554 * Number(L.wbc_k)
    + 0.0804 * age

  const g = 0.0076927
  const mort = 1 - Math.exp((-Math.exp(xb) * (Math.exp(120 * g) - 1)) / g)
  const m = Math.min(Math.max(mort, 1e-9), 1 - 1e-9)
  const phenoAge = 141.50225 + Math.log(-0.00553 * Math.log(1 - m)) / 0.090165
  const pa = Math.round(phenoAge * 10) / 10
  return { phenoAge: pa, delta: Math.round((pa - age) * 10) / 10, chronological: age }
}

