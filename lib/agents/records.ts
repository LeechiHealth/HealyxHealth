import type { AgentId } from "@/lib/agents/config"
import { searchTerms } from "@/lib/agents/research"

export type Medication = { name?: string; generic_name?: string; dosage?: string; frequency?: string; route?: string; status?: string; pharmacy?: string; prescribing_doctor?: string; start_date?: string; end_date?: string }
export type Condition = { name?: string; status?: string }
export type Lab = { name?: string; value?: number | string | null; unit?: string | null; status?: string | null; test_date?: string | null }
export type Profile = { date_of_birth?: string | null; gender?: string | null; insurance_provider?: string | null }
export type Records = { medications: Medication[]; conditions: Condition[]; labs: Lab[]; profile: Profile | null; unavailable: boolean }

export const INACTIVE = /stopped|discontinued|completed|inactive|past/i

export async function loadRecords(db: any, userId: string): Promise<Records> {
  const optional = async (query: PromiseLike<{ data: any; error: any }>) => {
    try { const result = await query; return result.error ? null : result.data } catch { return null }
  }
  const [medications, conditions, labs, profile] = await Promise.all([
    db.from("medications").select("*").eq("user_id", userId).limit(40),
    db.from("conditions").select("*").eq("user_id", userId).limit(40),
    // Labs and the profile are extras: an agent still runs if they can't be read.
    optional(db.from("biomarkers").select("name, value, unit, status, test_date").eq("user_id", userId).order("test_date", { ascending: false }).limit(60)),
    optional(db.from("profiles").select("date_of_birth, gender, insurance_provider").eq("id", userId).limit(1)),
  ])
  return {
    medications: medications.data || [], conditions: conditions.data || [],
    labs: Array.isArray(labs) ? labs : [], profile: Array.isArray(profile) ? profile[0] || null : profile || null,
    unavailable: Boolean(medications.error || conditions.error),
  }
}

export const names = (items: { name?: string }[]) => items.map(item => item.name).filter((name): name is string => Boolean(name))

/** Whole years between a YYYY-MM-DD birth date and today; null when unknown. */
export function ageOn(dateOfBirth: string | null | undefined, today: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)) return null
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
  return age >= 0 && age < 130 ? age : null
}

/** Only the fields each agent needs are sent to the AI provider. */
export function recordsFor(agent: AgentId, records: Records, today = new Date().toISOString().slice(0, 10)): string {
  if (records.unavailable) return "Saved records could not be loaded right now. Work only from what the person says."
  const active = records.medications.filter(med => !INACTIVE.test(med.status || ""))
  const insurance = records.profile?.insurance_provider || null
  if (agent === "rx_saver") {
    return JSON.stringify({
      insurance_plan: insurance,
      medications: records.medications.map(med => ({ name: med.name, generic_name: med.generic_name || null, dose: med.dosage || null, frequency: med.frequency || null, route: med.route || null, status: med.status || null, pharmacy: med.pharmacy || null, prescriber: med.prescribing_doctor || null })),
    })
  }
  if (agent === "care_finder") {
    return JSON.stringify({ insurance_plan: insurance, conditions: records.conditions.map(c => ({ name: c.name, status: c.status || null })), medications: names(active), doctors: [...new Set(records.medications.map(med => med.prescribing_doctor).filter(Boolean))] })
  }
  if (agent === "bill_advocate") {
    return JSON.stringify({ insurance_plan: insurance, conditions: names(records.conditions) })
  }
  if (agent === "follow_through") {
    return JSON.stringify({
      age: ageOn(records.profile?.date_of_birth, today), sex: records.profile?.gender || null,
      conditions: records.conditions.map(c => ({ name: c.name, status: c.status || null })),
      medications: active.map(med => ({ name: med.name, dose: med.dosage || null, frequency: med.frequency || null, started: med.start_date || null })),
      recent_labs: records.labs.slice(0, 40).map(lab => ({ name: lab.name, value: lab.value ?? null, unit: lab.unit || null, status: lab.status || null, date: lab.test_date ? String(lab.test_date).slice(0, 10) : null })),
    })
  }
  return JSON.stringify({ conditions: names(records.conditions), medications: names(active) })
}

export function recordTerms(records: Records): string[] {
  return searchTerms([...records.medications.flatMap(med => [med.name, med.generic_name]), ...records.conditions.map(c => c.name)])
}
