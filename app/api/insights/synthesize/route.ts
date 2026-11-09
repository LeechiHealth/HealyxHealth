import { NextResponse } from "next/server";
import { reportedPassages } from "@/lib/researchComparison";

function xmlText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return (match?.[1] || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

// This endpoint deliberately provides a source reading aid rather than
// generating clinical findings or personal relevance from a title alone.
export async function POST(req: Request) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Send a valid source identifier." }, { status: 400 }); }

  const result = body?.result;
  const pmid = typeof result?.pmid === "string" && /^\d{1,10}$/.test(result.pmid) ? result.pmid : null;
  const nctId = typeof result?.nctId === "string" && /^NCT\d{8}$/.test(result.nctId) ? result.nctId : null;
  if (!pmid && !nctId) return NextResponse.json({ error: "A valid PubMed or ClinicalTrials.gov identifier is required. A title alone is insufficient evidence." }, { status: 400 });

  try {
    let abstract = "";
    let title = "";
    let url = "";
    if (pmid) {
      const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Source unavailable");
      const xml = await response.text();
      if (xmlText(xml, "PMID") !== pmid) return NextResponse.json({ error: "The requested source could not be verified." }, { status: 422 });
      title = xmlText(xml, "ArticleTitle");
      abstract = [...xml.matchAll(/<AbstractText(?:\s[^>]*)?>[\s\S]*?<\/AbstractText>/gi)].map(match => xmlText(match[0], "AbstractText")).join("\n");
      url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    } else {
      const response = await fetch(`https://clinicaltrials.gov/api/v2/studies/${nctId}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Source unavailable");
      const data = await response.json();
      const protocol = data.protocolSection;
      if (protocol?.identificationModule?.nctId !== nctId) return NextResponse.json({ error: "The requested registration could not be verified." }, { status: 422 });
      title = protocol.identificationModule.officialTitle || protocol.identificationModule.briefTitle || "";
      abstract = protocol.descriptionModule?.briefSummary || "";
      url = `https://clinicaltrials.gov/study/${nctId}`;
    }
    if (!abstract.trim()) return NextResponse.json({ error: "No source abstract or registry summary is available. Open the original source; there is not enough evidence to summarize findings." }, { status: 422 });
    const population = reportedPassages(abstract, "population");
    const limitations = reportedPassages(abstract, "limitations");
    return NextResponse.json({
      mode: "source-excerpts",
      cached: false,
      source: { title, url, id: pmid || nctId },
      evidence: { abstract, population, limitations },
      uncertainty: "No findings, agreement between studies, or personal applicability have been inferred. Missing passages require checking the full source.",
      sections: {
        plain_summary: abstract,
        key_findings: "No conclusion generated. Read the original abstract and methods before interpreting results.",
        profile_relevance: "Personal applicability has not been assessed.",
        what_to_discuss: "Does the study population match my situation? What were the absolute benefits, harms, and limitations? Would this change our plan?",
      },
    });
  } catch {
    return NextResponse.json({ error: "The original research source is unavailable. Please try again or open the source directly." }, { status: 502 });
  }
}
