import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { conditionName, userContext } = await req.json();

    // PubMed search
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(conditionName)}&retmax=5&sort=relevance&retmode=json`;
    const searchRes = await fetch(searchUrl);

    const pubmedArticles: Array<{
      title: string;
      url: string;
      source: string;
      badge: string;
      metadata?: string;
    }> = [];

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const ids: string[] = searchData.esearchresult?.idlist || [];

      if (ids.length > 0) {
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
        const summaryRes = await fetch(summaryUrl);

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const result = summaryData.result || {};

          ids
            .filter((id) => result[id])
            .forEach((id) => {
              pubmedArticles.push({
                title: result[id].title || `PubMed Article ${id}`,
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                source: "PubMed / NIH",
                badge: "Peer-Reviewed",
                metadata: result[id].pubdate
                  ? `Published: ${result[id].pubdate}`
                  : undefined,
              });
            });
        }
      }
    }

    const clinicalReferences = [
      {
        title: `MedlinePlus — ${conditionName}`,
        url: `https://medlineplus.gov/search/?query=${encodeURIComponent(conditionName)}`,
        source: "MedlinePlus / NLM",
        badge: "NLM",
        metadata: "Patient-friendly overview from the National Library of Medicine",
      },
      ...pubmedArticles,
    ];

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });

    const prompt = `You are a medical information assistant. Return a JSON object with exactly these four keys for the condition "${conditionName}".

${pubmedArticles.length > 0 ? `${pubmedArticles.length} PubMed research articles were found for this condition.` : ""}
${userContext ? `Patient Context: ${userContext}` : ""}

Return ONLY valid JSON with no markdown or code blocks:
{
  "overview": "2-3 sentence plain-English description of what this condition is, who it affects, and its causes.",
  "symptoms": "The most common and notable symptoms patients experience. Be specific and practical.",
  "treatment": "Standard treatment approaches: medications, lifestyle changes, therapies. Evidence-based and clear.",
  "when_to_seek_help": "Specific warning signs where the patient should contact their doctor or seek emergency care immediately."
}`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    let sections;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      sections = JSON.parse(cleaned);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      sections = match ? JSON.parse(match[0]) : { overview: rawText, symptoms: null, treatment: null, when_to_seek_help: null };
    }

    return NextResponse.json({
      condition: conditionName,
      sections,
      clinicalReferences,
    });
  } catch (error) {
    console.error("Error generating condition insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
