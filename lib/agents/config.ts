// Shared by the Agents page and /api/agents/run. Capability labels must stay
// honest: "works" means the feature is usable today without an integration.

export const AGENT_IDS = ["appointments", "medications", "research", "shopping"] as const
export type AgentId = (typeof AGENT_IDS)[number]

export type CapabilityStatus = "works" | "needs_connection"
export interface Capability { label: string; status: CapabilityStatus }

export interface AgentDefinition {
  id: AgentId
  name: string
  tagline: string
  /** Plain description of which saved records this agent sends to the AI provider. */
  usesRecords: string
  capabilities: Capability[]
  starters: string[]
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "appointments",
    name: "Appointments",
    tagline: "Requests, reminders and visit prep",
    usesRecords: "your condition names, medication names and listed prescribers",
    capabilities: [
      { label: "Draft appointment requests and call scripts", status: "works" },
      { label: "Calendar reminders for Apple, Google and Outlook", status: "works" },
      { label: "Questions to ask, from your records", status: "works" },
      { label: "Book directly with your clinic", status: "needs_connection" },
    ],
    starters: [
      "Help me book my annual physical",
      "I have a dentist appointment next Thursday at 2:30pm. Remind me.",
      "What should I ask at my next checkup?",
    ],
  },
  {
    id: "medications",
    name: "Medications",
    tagline: "Reminders and refill requests",
    usesRecords: "your medication list, doses, pharmacy and prescribers",
    capabilities: [
      { label: "Daily medication reminders on your calendar", status: "works" },
      { label: "Refill request drafts and run-out reminders", status: "works" },
      { label: "Send refill requests to your pharmacy", status: "needs_connection" },
    ],
    starters: [
      "Set up reminders for my medications",
      "I have 10 doses left and take it once a day. When should I refill?",
      "Draft a refill request for my pharmacy",
    ],
  },
  {
    id: "research",
    name: "Research",
    tagline: "Medications, treatments and conditions",
    usesRecords: "your condition and medication names",
    capabilities: [
      { label: "FDA label warnings and interaction mentions", status: "works" },
      { label: "PubMed reviews and trials, with citations", status: "works" },
      { label: "Recruiting clinical trials", status: "works" },
      { label: "Alerts when new research appears", status: "needs_connection" },
    ],
    starters: [
      "What does the research say about magnesium for sleep?",
      "Check the FDA labels for my medications",
      "Are there recruiting trials for my condition?",
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    tagline: "Supplies and OTC, checked against your meds",
    usesRecords: "your medication and condition names",
    capabilities: [
      { label: "Shopping lists with what to look for", status: "works" },
      { label: "OTC label check against your records", status: "works" },
      { label: "Store search links", status: "works" },
      { label: "Order through connected accounts", status: "needs_connection" },
    ],
    starters: [
      "I need a home blood pressure monitor",
      "What should be in a cold and flu kit?",
      "Can I pick up ibuprofen with my current meds?",
    ],
  },
]

export const CONNECTIONS: { name: string; detail: string; status: CapabilityStatus }[] = [
  { name: "Calendar", detail: "Add reminders with a file or a Google Calendar link", status: "works" },
  { name: "Research sources", detail: "PubMed, ClinicalTrials.gov and openFDA. No account needed", status: "works" },
  { name: "Pharmacy", detail: "Refills are drafts you send yourself", status: "needs_connection" },
  { name: "Patient portal", detail: "Requests are drafts you send yourself", status: "needs_connection" },
  { name: "Store accounts", detail: "Search links only, no orders", status: "needs_connection" },
]

export const agentById = (id: string) => AGENTS.find(agent => agent.id === id)
