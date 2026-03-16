import { NextResponse } from "next/server";

export interface SearchResult {
  id: string;
  type: "journal" | "clinical-trial" | "review";
  title: string;
  source: string;
  badge: string;
  badges: string[];
  date?: string;
  year?: string;
  journal?: string;
  abstract?: string;
  authors?: string[];
  meshTerms?: string[];
  url: string;
  pmid?: string;
  nctId?: string;
  status?: string;
  phase?: string;
  conditions?: string[];
  sponsor?: string;
}

// ─── PubMed XML parsing helpers ───────────────────────────────────────────────

function extractXmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function extractAllXmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) results.push(text);
  }
  return results;
}

// ─── Fetch PubMed abstracts + MeSH in one efetch call ─────────────────────────

async function fetchPubMedDetails(
  ids: string[]
): Promise<Record<string, { abstract: string; meshTerms: string[] }>> {
  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=xml&retmode=xml`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return {};

    const xml = await res.text();

    // Split into individual articles
    const articleChunks = xml.split(/<PubmedArticle[^>]*>/i).slice(1);

    const map: Record<string, { abstract: string; meshTerms: string[] }> = {};

    for (let i = 0; i < articleChunks.length; i++) {
      const chunk = articleChunks[i];
      const pmid = extractXmlTag(chunk, "PMID");
      if (!pmid) continue;

      // Abstract — may have multiple AbstractText elements (structured abstract)
      const abstractParts = extractAllXmlTags(chunk, "AbstractText");
      const abstract = abstractParts.join(" ").substring(0, 1500);

      // MeSH descriptor names (top-level headings only)
      const meshRaw = extractAllXmlTags(chunk, "DescriptorName");
      const meshTerms = [...new Set(meshRaw)].slice(0, 8);

      map[pmid] = { abstract, meshTerms };
    }

    return map;
  } catch {
    return {};
  }
}

// ─── PubMed search ─────────────────────────────────────────────────────────────

async function fetchPubMed(query: string): Promise<SearchResult[]> {
  try {
    const searchRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=10&sort=relevance&retmode=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const ids: string[] = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    // Fetch summary + details in parallel
    const [summaryRes, detailsMap] = await Promise.all([
      fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`,
        { signal: AbortSignal.timeout(6000) }
      ),
      fetchPubMedDetails(ids),
    ]);

    if (!summaryRes.ok) return [];
    const summaryData = await summaryRes.json();
    const result = summaryData.result || {};

    return ids
      .filter((id) => result[id])
      .map((id) => {
        const article = result[id];
        const pubTypes: string[] = article.pubtype || [];
        const details = detailsMap[id] || { abstract: "", meshTerms: [] };

        // Determine primary type + badges
        let type: SearchResult["type"] = "journal";
        let primaryBadge = "Peer-Reviewed";
        const badges: string[] = [];

        if (
          pubTypes.some(
            (t) =>
              t.toLowerCase().includes("meta-analysis")
          )
        ) {
          type = "review";
          primaryBadge = "Meta-Analysis";
          badges.push("Meta-Analysis");
        } else if (
          pubTypes.some((t) => t.toLowerCase().includes("systematic review"))
        ) {
          type = "review";
          primaryBadge = "Systematic Review";
          badges.push("Systematic Review");
        } else if (
          pubTypes.some(
            (t) =>
              t.toLowerCase().includes("randomized controlled") ||
              t.toLowerCase().includes("randomized clinical")
          )
        ) {
          type = "journal";
          primaryBadge = "RCT";
          badges.push("RCT");
        } else if (
          pubTypes.some((t) => t.toLowerCase().includes("clinical trial"))
        ) {
          type = "clinical-trial";
          primaryBadge = "Clinical Trial";
          badges.push("Clinical Trial");
        } else if (
          pubTypes.some((t) => t.toLowerCase().includes("review"))
        ) {
          type = "review";
          primaryBadge = "Literature Review";
          badges.push("Literature Review");
        } else {
          badges.push("Peer-Reviewed");
        }

        // Authors: take first 3
        const authorList: { name: string }[] = article.authors || [];
        const authors = authorList
          .filter((a) => a.name)
          .map((a) => a.name)
          .slice(0, 3);

        // Year from pubdate
        const year = article.pubdate?.match(/\d{4}/)?.[0];

        return {
          id: `pubmed-${id}`,
          type,
          title: (article.title || `PubMed Article ${id}`).replace(/\.$/, ""),
          source: "PubMed / NIH",
          badge: primaryBadge,
          badges,
          date: article.pubdate,
          year,
          journal: article.fulljournalname || article.source,
          abstract: details.abstract,
          meshTerms: details.meshTerms,
          authors,
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          pmid: id,
        };
      });
  } catch {
    return [];
  }
}

// ─── ClinicalTrials.gov search ─────────────────────────────────────────────────

async function fetchClinicalTrials(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=5&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const studies = data.studies || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return studies.map((study: any) => {
      const proto = study.protocolSection;
      const nctId = proto?.identificationModule?.nctId || "";
      const status: string = proto?.statusModule?.overallStatus || "";
      const briefSummary: string =
        proto?.descriptionModule?.briefSummary || "";
      const phases: string[] =
        proto?.designModule?.phases || [];
      const conditions: string[] =
        proto?.conditionsModule?.conditions || [];
      const sponsor: string =
        proto?.sponsorCollaboratorsModule?.leadSponsor?.name || "";

      // Normalize status to readable
      const statusLabel = status
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const phase = phases
        .map((p) => p.replace("PHASE", "Phase "))
        .join(" / ");

      const badges = ["Clinical Trial"];
      if (status === "RECRUITING") badges.push("Recruiting");
      else if (status === "COMPLETED") badges.push("Completed");
      else if (status === "ACTIVE_NOT_RECRUITING") badges.push("Active");

      return {
        id: `trial-${nctId}`,
        type: "clinical-trial" as const,
        title: (
          proto?.identificationModule?.officialTitle ||
          proto?.identificationModule?.briefTitle ||
          nctId
        ).replace(/\.$/, ""),
        source: "ClinicalTrials.gov",
        badge: "Clinical Trial",
        badges,
        date: proto?.statusModule?.startDateStruct?.date,
        year: proto?.statusModule?.startDateStruct?.date?.match(/\d{4}/)?.[0],
        abstract: briefSummary.substring(0, 600),
        authors: sponsor ? [sponsor] : [],
        url: `https://clinicaltrials.gov/study/${nctId}`,
        nctId,
        status: statusLabel,
        phase: phase || undefined,
        conditions: conditions.slice(0, 3),
        meshTerms: conditions.slice(0, 5),
      };
    });
  } catch {
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ results: [] });
    }

    const [pubmedResults, trialsResults] = await Promise.all([
      fetchPubMed(query),
      fetchClinicalTrials(query),
    ]);

    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const r of [...pubmedResults, ...trialsResults]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        results.push(r);
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
