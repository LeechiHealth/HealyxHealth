// Shared by the Agents page and /api/agents/run. Capability labels must stay
// honest: "works" means usable today; "coming" means planned and not built yet.

export const AGENT_IDS = ["care_finder", "bill_advocate", "rx_saver", "follow_through", "research"] as const
export type AgentId = (typeof AGENT_IDS)[number]

/** Agents from before November 2026. Their saved conversations and tasks stay readable, but new runs use AGENT_IDS. */
export const LEGACY_AGENT_IDS = ["appointments", "medications", "shopping"] as const
export type LegacyAgentId = (typeof LEGACY_AGENT_IDS)[number]
export type StoredAgentId = AgentId | LegacyAgentId

export const LEGACY_AGENT_NAMES: Record<LegacyAgentId, string> = { appointments: "Appointments", medications: "Medications", shopping: "Shopping" }

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
    id: "care_finder",
    name: "Care Finder",
    tagline: "In-network, soonest and cheapest care near you",
    intro: "Hey, I'm Care Finder. I find doctors, clinics and tests near you, check who takes your insurance, and line up the soonest, cheapest option.",
    howTo: "Tell me what care you need.",
    usesRecords: "your insurance plan name, city or ZIP, condition names and listed doctors",
    capabilities: [
      { label: "Search the national provider registry (NPI) by specialty and area", status: "works" },
      { label: "Browse the web for openings, reviews and cash prices", status: "works" },
      { label: "Ranked shortlists with phone numbers and call scripts", status: "works" },
      { label: "Remembers your insurance, ZIP and doctors", status: "works" },
      { label: "Call offices to confirm insurance and book", status: "coming" },
    ],
    starters: [
      "Find an in-network dermatologist near me with the soonest opening",
      "Where's the cheapest MRI of the knee near me?",
      "I need a primary care doctor who takes my insurance",
    ],
  },
  {
    id: "bill_advocate",
    name: "Bill & Insurance Advocate",
    tagline: "Catches billing errors, fights denials, finds financial help",
    intro: "Hi, I'm your Bill & Insurance Advocate. Send me a medical bill, an insurance statement or a denial, and I'll find errors, draft appeals and look for financial help.",
    howTo: "Send a bill photo or describe it.",
    usesRecords: "your insurance plan name and the bills or statements you share",
    capabilities: [
      { label: "Read bill and EOB photos", status: "works" },
      { label: "Flag duplicate charges, upcoding, unbundling and surprise bills", status: "works" },
      { label: "Check a hospital's financial assistance policy", status: "works" },
      { label: "Draft appeal letters and itemized bill requests", status: "works" },
      { label: "Send letters and track replies", status: "coming" },
    ],
    starters: [
      "My insurance denied my MRI. Help me appeal it.",
      "This ER bill looks way too high",
      "Do I qualify for financial assistance at my hospital?",
    ],
  },
  {
    id: "rx_saver",
    name: "Rx Saver",
    tagline: "Cheapest way to fill your prescriptions, plus refills",
    intro: "Hey, I'm Rx Saver. I compare what your prescriptions cost at Amazon Pharmacy, Cost Plus Drugs, Publix and discount cards, and keep your refills on time.",
    howTo: "Name a medication to price.",
    usesRecords: "your medication list, doses, pharmacy, prescribers and insurance plan name",
    capabilities: [
      { label: "Price checks across online and local pharmacies", status: "works" },
      { label: "Generic and lower-cost alternatives to ask your prescriber about", status: "works" },
      { label: "Refill drafts with run-out dates and reminders", status: "works" },
      { label: "Medication reminders on your calendar", status: "works" },
      { label: "Transfer or order prescriptions for you", status: "coming" },
    ],
    starters: [
      "Where's the cheapest place to fill my prescriptions?",
      "Is there a cheaper alternative to my medication?",
      "I have 10 pills left, once a day. When should I refill?",
    ],
  },
  {
    id: "follow_through",
    name: "Follow-Through",
    tagline: "Catches results, referrals and screenings that slip",
    intro: "Hi, I'm Follow-Through. I look across your records for loose ends, like labs that need a recheck, referrals never booked and screenings due, and put reminders on your list.",
    howTo: "Ask what you're forgetting.",
    usesRecords: "your recent lab results, conditions, medications, age, sex and agent queue",
    capabilities: [
      { label: "Find labs flagged without a recheck", status: "works" },
      { label: "Screenings due for your age and sex (USPSTF)", status: "works" },
      { label: "Refills running out and open referrals", status: "works" },
      { label: "Reminders with due dates and calendar alerts", status: "works" },
      { label: "Check in on a schedule", status: "coming" },
    ],
    starters: [
      "What am I forgetting about my health?",
      "Which screenings am I due for?",
      "Did any of my labs need a recheck?",
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
]

export const CONNECTIONS: { name: string; detail: string; status: CapabilityStatus }[] = [
  { name: "Web browsing", detail: "Agents search and read public sites", status: "works" },
  { name: "Provider registry", detail: "The national NPI registry of US clinicians", status: "works" },
  { name: "Agent memory", detail: "Your insurance, ZIP, pharmacy and doctors, saved for next time", status: "works" },
  { name: "Research sources", detail: "PubMed, ClinicalTrials.gov and openFDA", status: "works" },
  { name: "Calendar", detail: "Reminders as a file or Google Calendar link", status: "works" },
  { name: "Website actions", detail: "Forms filled in a secure browser, you approve", status: "coming" },
  { name: "Scheduled check-ins", detail: "Agents message you first on a schedule", status: "coming" },
]

export const isAgentId = (id: string): id is AgentId => (AGENT_IDS as readonly string[]).includes(id)

export const agentById = (id: string) => AGENTS.find(agent => agent.id === id)

/** Display name for any stored agent id, including the retired ones. */
export const agentName = (id: string) => agentById(id)?.name ?? LEGACY_AGENT_NAMES[id as LegacyAgentId] ?? "Agent"
