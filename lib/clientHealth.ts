// Home and Protocol share exactly the same eligibility rules and score inputs.
import { supabase } from "@/lib/supabase/client"
import { computeHealthScore, finiteObservation, observationDate, prepareScoringLabs, type FactorProvenance } from "@/lib/healthScore"

export interface LoadedHealthScore extends ReturnType<typeof computeHealthScore> {
  pheno: { phenoAge: number; delta: number; chronological: number } | null
  provenance: Record<string, FactorProvenance>
  phenoUnavailableReason: string
}

export async function loadHealthScore(userId: string): Promise<LoadedHealthScore> {
  const [bioRes, vRes, pRes, iRes] = await Promise.all([
    supabase.from("biomarkers").select("name, value, unit, status, test_date").eq("user_id", userId).order("test_date", { ascending: false }),
    // A heart-rate-only entry must not erase an earlier complete BP reading.
    supabase.from("vitals").select("systolic_bp, diastolic_bp, bmi, recorded_at")
      .eq("user_id", userId).order("recorded_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("height_inches, weight_lbs").eq("id", userId).maybeSingle(),
    supabase.from("intake_responses").select("sleep_hours, nicotine, completed_at")
      .eq("user_id", userId).eq("completed", true).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (bioRes.error || vRes.error || pRes.error || iRes.error) throw new Error("Unable to load health metrics. Please refresh and try again.")

  const labs = prepareScoringLabs(bioRes.data || [])
  const vitals = ((vRes.data || []) as Record<string, unknown>[])
    .filter(v => observationDate(v.recorded_at))
    .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
  // Both BP values must belong to the same dated observation, never separate visits.
  const bp = vitals.find(v => v.systolic_bp != null || v.diastolic_bp != null)
  const bmiRow = vitals.find(v => v.bmi != null)
  const p = (pRes.data || {}) as Record<string, unknown>
  const height = finiteObservation(p.height_inches)
  const weight = finiteObservation(p.weight_lbs)
  const bmi = bmiRow ? finiteObservation(bmiRow.bmi)
    : height != null && weight != null && height > 0 && weight > 0 ? 703 * weight / height ** 2 : null
  const intake = (iRes.data || {}) as Record<string, unknown>
  const intakeDate = observationDate(intake.completed_at)
  const result = computeHealthScore({
    systolic: finiteObservation(bp?.systolic_bp), diastolic: finiteObservation(bp?.diastolic_bp),
    hba1c: labs.hba1c, fastingGlucose: labs.fastingGlucose, nonHDL: labs.nonHDL, bmi,
    sleepHours: intakeDate ? finiteObservation(intake.sleep_hours) : null,
    activityMinutes: null, // Exercise days do not establish duration or intensity.
    nicotine: intakeDate && typeof intake.nicotine === "string" ? intake.nicotine : null,
  })
  const available = (key: string) => result.components.find(c => c.key === key)?.score != null
  const provenance: Record<string, FactorProvenance> = {
    ...labs.provenance,
    bp: { date: bp ? observationDate(bp.recorded_at) : null, source: "Paired systolic/diastolic vital, mmHg", reason: available("bp") ? null : "Needs a valid dated blood-pressure pair from one observation." },
    bmi: { date: bmiRow ? observationDate(bmiRow.recorded_at) : null, source: bmiRow ? "Recorded BMI" : "BMI derived from profile height (in) and weight (lb); profile measurements are undated", reason: available("bmi") ? null : "Needs a valid BMI or positive profile height and weight." },
    sleep: { date: intakeDate, source: "Self-reported sleep hours, completed intake", reason: available("sleep") ? null : "Needs valid sleep hours from a dated completed intake." },
    nicotine: { date: intakeDate, source: "Self-reported nicotine status, completed intake", reason: available("nicotine") ? null : "Needs an explicit Never, Former, or Current response from a dated intake." },
    activity: { date: null, source: "Not measured", reason: "Exercise days alone cannot establish minutes or intensity." },
  }
  // Dates alone do not prove that nine tests share a specimen/panel. The current
  // schema cannot verify that provenance, so do not manufacture a biological age
  // by combining arbitrary historic rows or today's age with old test results.
  return { ...result, pheno: null, provenance, phenoUnavailableReason: "Requires verified same-panel laboratory provenance and compatible units; unavailable for the current records." }
}
