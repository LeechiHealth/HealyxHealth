// Public evidence sources used by the Research and Shopping agents.
// Only search terms are sent to these services, never personal records.

export interface Source {
  n: number
  kind: "pubmed" | "trial" | "fda_label"
  title: string
  url: string
  meta: string
  /** Text the summary model may rely on. Never shown as a finding by itself. */
  excerpt: string
}

export interface LabelSection { section: string; text: string }
export interface DrugLabel {
  drug: string
  product: string
  url: string
  otc: boolean
  sections: LabelSection[]
}
export interface LabelMention { drug: string; term: string; matched: string; section: string; excerpt: string; url: string }

const NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
const TIMEOUT = 7000

export const SECTION_LABELS: Record<string, string> = {
  boxed_warning: "Boxed warning",
  contraindications: "Contraindications",
  warnings_and_cautions: "Warnings and precautions",
  warnings: "Warnings",
  drug_interactions: "Drug interactions",
  indications_and_usage: "Uses",
  do_not_use: "Do not use",
  ask_doctor: "Ask a doctor before use",
  ask_doctor_or_pharmacist: "Ask a doctor or pharmacist before use",
  stop_use: "Stop use and ask a doctor",
}

const clean = (value: string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim()

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))
  return match ? clean(match[1]) : ""
}

function studyType(pubtypes: string[]): string {
  const types = pubtypes.map(type => type.toLowerCase())
  if (types.some(type => type.includes("meta-analysis"))) return "Meta-analysis"
  if (types.some(type => type.includes("systematic review"))) return "Systematic review"
  if (types.some(type => type.includes("practice guideline") || type === "guideline")) return "Guideline"
  if (types.some(type => type.includes("randomized controlled"))) return "Randomized trial"
  if (types.some(type => type.includes("clinical trial"))) return "Clinical trial"
  if (types.some(type => type.includes("review"))) return "Review"
  return "Study"
}

async function getJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!response.ok) throw new Error(`Source returned ${response.status}`)
  return response.json()
}

/** Searches PubMed, preferring reviews, guidelines and randomized trials. */
export async function searchPubMed(query: string, limit = 5): Promise<Omit<Source, "n">[]> {
  const q = query.trim().slice(0, 300)
  if (!q) return []
  const preferred = `(${q}) AND (meta-analysis[pt] OR systematic review[pt] OR practice guideline[pt] OR randomized controlled trial[pt] OR review[pt])`
  let ids: string[] = []
  for (const term of [preferred, q]) {
    const search = await getJson(`${NCBI}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${limit}&term=${encodeURIComponent(term)}`)
    ids = search?.esearchresult?.idlist || []
    if (ids.length) break
  }
  if (!ids.length) return []
  const [summary, abstractsXml] = await Promise.all([
    getJson(`${NCBI}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`),
    fetch(`${NCBI}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}`, { signal: AbortSignal.timeout(TIMEOUT) }).then(r => (r.ok ? r.text() : "")).catch(() => ""),
  ])
  const abstracts = new Map<string, string>()
  for (const chunk of abstractsXml.split(/<PubmedArticle[\s>]/i).slice(1)) {
    const pmid = tag(chunk, "PMID")
    const parts = [...chunk.matchAll(/<AbstractText(?:\s[^>]*)?>[\s\S]*?<\/AbstractText>/gi)].map(match => tag(match[0], "AbstractText"))
    if (pmid) abstracts.set(pmid, parts.join(" ").slice(0, 1100))
  }
  return ids.filter(id => summary?.result?.[id]).map(id => {
    const article = summary.result[id]
    const year = String(article.pubdate || "").match(/\d{4}/)?.[0]
    const type = studyType(article.pubtype || [])
    return {
      kind: "pubmed" as const,
      title: clean(String(article.title || `PubMed ${id}`)).replace(/\.$/, ""),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      meta: [type, year, article.source].filter(Boolean).join(" · "),
      excerpt: abstracts.get(id) || "No abstract available. Only the title is known.",
    }
  })
}

/** Recruiting studies on ClinicalTrials.gov. Registration is not evidence of benefit. */
export async function searchTrials(query: string, limit = 3): Promise<Omit<Source, "n">[]> {
  const q = query.trim().slice(0, 200)
  if (!q) return []
  // Condition match first (more precise), then a full-text search as a fallback.
  const base = `https://clinicaltrials.gov/api/v2/studies?format=json&pageSize=${limit}&filter.overallStatus=RECRUITING`
  let data = await getJson(`${base}&query.cond=${encodeURIComponent(q)}`)
  if (!data?.studies?.length) data = await getJson(`${base}&query.term=${encodeURIComponent(q)}`)
  return (data?.studies || []).map((study: any) => {
    const protocol = study.protocolSection || {}
    const nctId = protocol.identificationModule?.nctId || ""
    const phases = (protocol.designModule?.phases || []).map((phase: string) => phase.replace("PHASE", "Phase ").replace("NA", "N/A"))
    return {
      kind: "trial" as const,
      title: clean(protocol.identificationModule?.briefTitle || nctId),
      url: `https://clinicaltrials.gov/study/${nctId}`,
      meta: ["Recruiting trial", phases.join("/"), protocol.sponsorCollaboratorsModule?.leadSponsor?.name].filter(Boolean).join(" · "),
      excerpt: `Trial registration (not results). ${clean(protocol.descriptionModule?.briefSummary || "").slice(0, 700)}`,
    }
  }).filter((source: { url: string }) => !source.url.endsWith("/"))
}

const LABEL_SECTIONS = Object.keys(SECTION_LABELS)

/** Prefers a single-ingredient label for the searched name over combination products. */
export function bestLabel(results: any[], term: string): any | null {
  let best: any = null
  let bestScore = -Infinity
  for (const label of results) {
    const generic = String(label.openfda?.generic_name?.[0] || "").toLowerCase()
    const brand = String(label.openfda?.brand_name?.[0] || "").toLowerCase()
    const combination = /,| and |\//.test(generic)
    let score = 0
    if (!combination) score += 4
    if (generic.startsWith(term)) score += 3
    else if (generic.includes(term)) score += 1
    if (brand === term) score += 1
    if (label.drug_interactions || label.ask_doctor_or_pharmacist) score += 1
    if (score > bestScore) { best = label; bestScore = score }
  }
  return best
}

/** Fetches the FDA label for a generic or brand name. Returns null when none is found. */
export async function fetchDrugLabel(name: string, otcOnly = false): Promise<DrugLabel | null> {
  const term = name.trim().toLowerCase().replace(/[^a-z0-9 \-]/g, "").slice(0, 60)
  if (term.length < 3) return null
  const quoted = encodeURIComponent(`"${term}"`)
  const search = otcOnly
    ? `(openfda.generic_name:${quoted}+openfda.substance_name:${quoted})+AND+openfda.product_type:${encodeURIComponent('"HUMAN OTC DRUG"')}`
    : `openfda.generic_name:${quoted}+openfda.brand_name:${quoted}+openfda.substance_name:${quoted}`
  const response = await fetch(`https://api.fda.gov/drug/label.json?limit=10&search=${search}`, { signal: AbortSignal.timeout(TIMEOUT) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`openFDA returned ${response.status}`)
  const label = bestLabel((await response.json())?.results || [], term)
  if (!label) return null
  const sections: LabelSection[] = []
  for (const key of LABEL_SECTIONS) {
    const text = Array.isArray(label[key]) ? clean(label[key].join(" ")) : ""
    if (text) sections.push({ section: key, text: text.slice(0, 30000) })
  }
  const setId = label.set_id || label.openfda?.spl_set_id?.[0]
  const product = label.openfda?.brand_name?.[0] || label.openfda?.generic_name?.[0] || name
  return {
    drug: name,
    product,
    otc: (label.openfda?.product_type?.[0] || "").includes("OTC"),
    url: setId ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setId)}` : `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(name)}`,
    sections,
  }
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Turns record entries such as "Metformin ER 500mg" into searchable names. */
export function searchTerms(names: (string | null | undefined)[]): string[] {
  const terms = new Set<string>()
  for (const raw of names) {
    if (!raw) continue
    const base = raw.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?|%)\b/g, " ").replace(/\b(er|xr|sr|dr|xl|hcl|tablets?|capsules?|oral)\b/g, " ").replace(/[^a-z0-9 \-]/g, " ").replace(/\s+/g, " ").trim()
    if (base.length >= 4) terms.add(base)
  }
  return [...terms]
}

// Labels often use plain words or drug classes instead of a record's name.
// Conservative, well-established equivalents only.
const CLASS_ALIASES: [RegExp, string[]][] = [
  [/^(hypertension|high blood pressure)$/, ["high blood pressure", "hypertension"]],
  [/diabetes/, ["diabetes"]],
  [/kidney disease|renal (disease|impairment)|ckd/, ["kidney disease", "renal impairment"]],
  [/liver disease|cirrhosis|hepatic/, ["liver disease", "liver cirrhosis", "hepatic impairment"]],
  [/heart failure/, ["heart failure"]],
  [/coronary|heart disease/, ["heart disease"]],
  [/^(gerd|acid reflux|reflux)$/, ["heartburn"]],
  [/^(hyperlipidemia|high cholesterol)$/, ["high cholesterol"]],
  [/^(warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|heparin|enoxaparin)$/, ["blood thinner", "anticoagulant"]],
  [/^(hydrochlorothiazide|chlorthalidone|furosemide|bumetanide|torsemide|spironolactone|triamterene)$/, ["diuretic"]],
  [/^(lisinopril|enalapril|ramipril|benazepril|quinapril|captopril|fosinopril)$/, ["ace inhibitor"]],
  [/^(losartan|valsartan|irbesartan|olmesartan|candesartan|telmisartan)$/, ["angiotensin receptor blocker", "arb"]],
  [/^(sertraline|fluoxetine|citalopram|escitalopram|paroxetine)$/, ["ssri", "antidepressant"]],
  [/^(phenelzine|tranylcypromine|isocarboxazid|selegiline)$/, ["maoi", "monoamine oxidase inhibitor"]],
]

export function termVariants(term: string): string[] {
  const variants = new Set([term])
  for (const [pattern, aliases] of CLASS_ALIASES) if (pattern.test(term)) aliases.forEach(alias => variants.add(alias))
  return [...variants]
}

// Most specific sections first, so a match is reported where the label is clearest.
const MENTION_SECTIONS = ["do_not_use", "ask_doctor_or_pharmacist", "ask_doctor", "stop_use", "contraindications", "boxed_warning", "drug_interactions", "warnings_and_cautions", "warnings"]

/**
 * Finds where a label's warning or interaction text names one of the person's
 * medications or conditions. A mention is not a confirmed interaction.
 */
export function labelMentions(label: DrugLabel, terms: string[]): LabelMention[] {
  const own = new Set(searchTerms([label.drug, label.product]))
  const mentions: LabelMention[] = []
  for (const term of terms) {
    if (own.has(term) || [...own].some(name => name.includes(term) || term.includes(name))) continue
    const pattern = new RegExp(`\\b(${termVariants(term).map(escapeRegex).join("|")})\\b`, "i")
    for (const key of MENTION_SECTIONS) {
      const found = label.sections.find(({ section }) => section === key)
      if (!found) continue
      const { section, text } = found
      const match = pattern.exec(text)
      if (!match) continue
      const start = Math.max(0, text.lastIndexOf(".", match.index - 1) + 1, match.index - 110)
      const endDot = text.indexOf(".", match.index + match[0].length)
      const end = Math.min(text.length, endDot === -1 ? match.index + 160 : endDot + 1, match.index + 160)
      mentions.push({ drug: label.product, term, matched: match[0].toLowerCase(), section: SECTION_LABELS[section] || section, excerpt: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`, url: label.url })
      break
    }
  }
  return mentions
}

export function sectionText(label: DrugLabel, keys: string[], max = 600): { section: string; text: string }[] {
  return label.sections.filter(({ section }) => keys.includes(section)).map(({ section, text }) => ({ section: SECTION_LABELS[section] || section, text: text.length > max ? `${text.slice(0, max).trim()}…` : text }))
}
