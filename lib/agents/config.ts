// Shared by the Agents page and /api/agents/run. Capability labels must stay
// honest: "works" means usable today; "coming" means planned and not built yet.

export const AGENT_IDS = ["appointments", "medications", "research", "shopping"] as const
export type AgentId = (typeof AGENT_IDS)[number]

export type CapabilityStatus = "works" | "needs_connection" | "coming"
export interface Capability { label: string; status: CapabilityStatus }

export interface AgentDefinition {
  id: AgentId
  name: string
  tagline: string
  /** The agent's first message: who it is, in its own voice. */
  intro: string
  /** How to use it, in seven words or fewer. */
  howTo: string
  /** Plain description of which saved records this agent sends to the AI provider. */
  usesRecords: string
  capabilities: Capability[]
  starters: string[]
}

export const AGENTS: AgentDefinition[] = [
  {
    id: "appointments",
    name: "Appointments",
    tagline: "Finds care, preps visits, sets reminders",
    intro: "Hey, I'm Appointments. I find doctors and clinics online, get your visits ready and keep them on your calendar.",
    howTo: "Tell me who, when, or what's wrong.",
    usesRecords: "your condition names, medication names and listed prescribers",
    capabilities: [
      { label: "Browse the web for doctors, clinics and hours", status: "works" },
      { label: "Draft appointment requests and call scripts", status: "works" },
      { label: "Calendar reminders for Apple, Google and Outlook", status: "works" },
      { label: "Fill in booking forms, with your approval", status: "coming" },
      { label: "Scheduled check-ins", status: "coming" },
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
    tagline: "Reminders, refills and label checks",
    intro: "Hi, I'm Medications. I keep your doses and refills on track and check labels when something new comes up.",
    howTo: "Name a medication and what you need.",
    usesRecords: "your medication list, doses, pharmacy and prescribers",
    capabilities: [
      { label: "Daily medication reminders on your calendar", status: "works" },
      { label: "Refill drafts with run-out dates worked out", status: "works" },
      { label: "FDA label and web lookups", status: "works" },
      { label: "Request refills on pharmacy sites, with your approval", status: "coming" },
      { label: "Scheduled refill check-ins", status: "coming" },
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
    tagline: "Studies, labels, trials and the web",
    intro: "Hi, I'm Research. I dig through studies, FDA labels, trials and the web, then tell you what holds up.",
    howTo: "Ask any health question in plain words.",
    usesRecords: "your condition and medication names",
    capabilities: [
      { label: "PubMed, FDA labels and recruiting trials", status: "works" },
      { label: "Web browsing for guidelines and news", status: "works" },
      { label: "Briefs where every point cites a source", status: "works" },
      { label: "Weekly alerts when new research appears", status: "coming" },
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
    tagline: "Finds supplies, checks them against your meds",
    intro: "Hey, I'm Shopping. I find health supplies and over-the-counter products online and check them against your meds.",
    howTo: "Tell me what you need to buy.",
    usesRecords: "your medication and condition names",
    capabilities: [
      { label: "Browse stores and reviews for options", status: "works" },
      { label: "OTC label check against your records", status: "works" },
      { label: "Shopping lists with what to look for", status: "works" },
      { label: "Add to cart on store sites, with your approval", status: "coming" },
    ],
    starters: [
      "I need a home blood pressure monitor",
      "What should be in a cold and flu kit?",
      "Can I pick up ibuprofen with my current meds?",
    ],
  },
]

export const CONNECTIONS: { name: string; detail: string; status: CapabilityStatus }[] = [
  { name: "Web browsing", detail: "Agents search and read public sites", status: "works" },
  { name: "Research sources", detail: "PubMed, ClinicalTrials.gov and openFDA", status: "works" },
  { name: "Calendar", detail: "Reminders as a file or Google Calendar link", status: "works" },
  { name: "Website actions", detail: "Forms filled in a secure browser, you approve", status: "coming" },
  { name: "Scheduled check-ins", detail: "Agents message you first on a schedule", status: "coming" },
]

export const agentById = (id: string) => AGENTS.find(agent => agent.id === id)
