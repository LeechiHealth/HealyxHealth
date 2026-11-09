export interface ResearchSource {
  id: string;
  title: string;
  source: string;
  type: string;
  url: string;
  abstract?: string;
  badges?: string[];
  year?: string;
  phase?: string;
  status?: string;
}

// Only quote sentences with explicit reporting language. These are excerpts,
// not inferred population characteristics or a quality appraisal.
export function reportedPassages(abstract: string | undefined, kind: "population" | "limitations"): string[] {
  if (!abstract?.trim()) return [];
  const sentences = abstract.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const marker = kind === "population"
    ? /\b(?:participants|patients|adults|children|subjects)\b[\s\S]*\b(?:enrolled|included|recruited|randomi[sz]ed|aged)\b|\b(?:enrolled|recruited|randomi[sz]ed)\b[\s\S]*\b(?:participants|patients|adults|children|subjects)\b/i
    : /\blimitations?\b|\b(?:small sample|short follow-up|selection bias|generalizability|generalisability)\b/i;
  return sentences.map(s => s.trim()).filter(s => marker.test(s)).slice(0, 2);
}

export function studyLabel(source: ResearchSource): string {
  if (source.type === "clinical-trial") return "Trial registration — not proof of benefit";
  const labels = (source.badges || []).filter(b => ["Meta-Analysis", "Systematic Review", "Literature Review", "RCT", "Clinical Trial"].includes(b));
  return labels.length ? labels.join(" · ") : "Publication — study design not supplied";
}

export function toggleComparison<T extends { id: string }>(current: T[], source: T): T[] {
  if (current.some(s => s.id === source.id)) return current.filter(s => s.id !== source.id);
  return current.length < 3 ? [...current, source] : current;
}

export function buildDiscussionBrief(sources: ResearchSource[], topic: string): string {
  return [
    `Research discussion: ${topic || "Selected studies"}`,
    "These sources have not been cross-validated. This is a reading list, not a treatment recommendation.",
    ...sources.map((s, i) => `\n${i + 1}. ${s.title}\n${studyLabel(s)} | ${s.year || "Date not supplied"}\n${s.url}`),
    "\nQuestions for my clinician:",
    "• Do these study populations and outcomes apply to my situation?",
    "• What are the absolute benefits, harms, and uncertainties?",
    "• Do these sources disagree, and what higher-quality evidence is missing?",
    "• Would any finding change our plan or what we measure next?",
  ].join("\n");
}
