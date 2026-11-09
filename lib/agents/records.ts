import type { AgentId } from "@/lib/agents/config"
import { searchTerms } from "@/lib/agents/research"

export type Medication = { name?: string; generic_name?: string; dosage?: string; frequency?: string; route?: string; status?: string; pharmacy?: string; prescribing_doctor?: string }
export type Condition = { name?: string; status?: string }
export type Records = { medications: Medication[]; conditions: Condition[]; unavailable: boolean }

export const INACTIVE = /stopped|discontinued|completed|inactive|past/i

export async function loadRecords(db: any, userId: string): Promise<Records> {
  const [medications, conditions] = await Promise.all([
    db.from("medications").select("*").eq("user_id", userId).limit(40),
    db.from("conditions").select("*").eq("user_id", userId).limit(40),
  ])
  return { medications: medications.data || [], conditions: conditions.data || [], unavailable: Boolean(medications.error || conditions.error) }
}

export const names = (items: { name?: string }[]) => items.map(item => item.name).filter((name): name is string => Boolean(name))

/** Only the fields each agent needs are sent to the AI provider. */
export function recordsFor(agent: AgentId, records: Records): string {
  if (records.unavailable) return "Saved records could not be loaded right now. Work only from what the person says."
  const active = records.medications.filter(med => !INACTIVE.test(med.status || ""))
  if (agent === "medications") {
    return JSON.stringify({ medications: records.medications.map(med => ({ name: med.name, generic_name: med.generic_name || null, dose: med.dosage || null, frequency: med.frequency || null, route: med.route || null, status: med.status || null, pharmacy: med.pharmacy || null, prescriber: med.prescribing_doctor || null })) })
  }
  if (agent === "appointments") {
    return JSON.stringify({ conditions: records.conditions.map(c => ({ name: c.name, status: c.status || null })), medications: names(active), prescribers: [...new Set(records.medications.map(med => med.prescribing_doctor).filter(Boolean))] })
  }
  return JSON.stringify({ conditions: names(records.conditions), medications: names(active) })
}

export function recordTerms(records: Records): string[] {
  return searchTerms([...records.medications.flatMap(med => [med.name, med.generic_name]), ...records.conditions.map(c => c.name)])
}
