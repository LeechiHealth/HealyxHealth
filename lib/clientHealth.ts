// Single source of truth for the Healyx Health Score on the client, so Home and
// Protocol always show the SAME number. Gathers the user's data and runs the
// simplified wellness indicator (+ PhenoAge) from lib/healthScore.ts.

import { supabase } from "@/lib/supabase/client"
import { computeHealthScore, computePhenoAge } from "@/lib/healthScore"

export interface LoadedHealthScore extends ReturnType<typeof computeHealthScore> {
  pheno: { phenoAge: number; delta: number; chronological: number } | null
}

export async function loadHealthScore(userId: string): Promise<LoadedHealthScore> {
  const [bioRes, vRes, pRes, iRes] = await Promise.all([
    supabase.from("biomarkers").select("name, value, status, test_date").eq("user_id", userId).order("test_date", { ascending: false }),
    supabase.from("vitals").select("systolic_bp, diastolic_bp, bmi, blood_glucose, recorded_at")
      .eq("user_id", userId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("height_inches, weight_lbs, date_of_birth").eq("id", userId).maybeSingle(),
    supabase.from("intake_responses").select("sleep_hours, exercise_days, nicotine")
      .eq("user_id", userId).eq("completed", true).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ])

  if (bioRes.error || vRes.error || pRes.error || iRes.error) throw new Error("Unable to load health metrics. Please refresh and try again.")

  const bios = (bioRes.data || []) as any[]
  const bioVal = (subs: string[]) => {
    const b = bios.find((x) => x.name && subs.some((s) => x.name.toLowerCase().includes(s)))
    return b && b.value !== "" && b.value != null && Number.isFinite(Number(b.value)) ? Number(b.value) : undefined
  }
  const v: any = vRes.data || {}
  const p: any = pRes.data || {}
  const ik: any = iRes.data || {}

  const total = bioVal(["total cholesterol", "cholesterol, total"])
  const hdlRow = bios.find(x => /^(hdl|hdl-c|hdl cholesterol|cholesterol, hdl)$/i.test(x.name?.trim() || ""))
  const hdl = hdlRow?.value != null && hdlRow.value !== "" && Number.isFinite(Number(hdlRow.value)) ? Number(hdlRow.value) : undefined
  const nonHDL = total != null && hdl != null ? total - hdl : undefined
  const bmi = (v.bmi != null ? Number(v.bmi) : undefined)
    ?? (p.height_inches && p.weight_lbs ? (703 * Number(p.weight_lbs)) / (Number(p.height_inches) ** 2) : undefined)

  const result = computeHealthScore({
    systolic: v.systolic_bp ?? null,
    diastolic: v.diastolic_bp ?? null,
    hba1c: bioVal(["a1c"]),
    fastingGlucose: (v.blood_glucose != null ? Number(v.blood_glucose) : undefined) ?? bioVal(["glucose"]),
    nonHDL,
    bmi,
    sleepHours: ik.sleep_hours != null ? Number(ik.sleep_hours) : null,
    activityMinutes: null, // Exercise days do not establish duration or intensity.
    nicotine: ik.nicotine ?? null,
  })

  const ageYears = p.date_of_birth
    ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000)
    : undefined
  const pheno = ageYears
    ? computePhenoAge({
        ageYears,
        albumin_gdl: bioVal(["albumin"]),
        creatinine_mgdl: bioVal(["creatinine"]),
        glucose_mgdl: (v.blood_glucose != null ? Number(v.blood_glucose) : undefined) ?? bioVal(["glucose"]),
        crp_mgl: bioVal(["c-reactive", "crp"]),
        lymphocyte_pct: bioVal(["lymphocyte"]),
        mcv_fl: bioVal(["mcv", "mean corpuscular volume", "mean cell volume"]),
        rdw_pct: bioVal(["rdw", "red cell distribution"]),
        alp_ul: bioVal(["alkaline phosphatase", "alk phos"]),
        wbc_k: bioVal(["wbc", "white blood cell"]),
      })
    : null

  return { ...result, pheno }
}
