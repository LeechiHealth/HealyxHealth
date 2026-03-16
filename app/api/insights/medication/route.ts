import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { medicationName, userContext } = await req.json();

    // Fetch from OpenFDA
    const fdaResponse = await fetch(
      `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(medicationName)}"&limit=1`
    );

    let fdaData = null;
    if (fdaResponse.ok) {
      const data = await fdaResponse.json();
      fdaData = data.results?.[0];
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }, { apiVersion: "v1" });

    const prompt = `You are a medical information assistant. Return a JSON object with exactly these four keys for the medication "${medicationName}".

${fdaData ? `FDA Label Data:
- Indications: ${fdaData.indications_and_usage?.[0]?.substring(0, 800) || "N/A"}
- Warnings: ${fdaData.warnings?.[0]?.substring(0, 800) || fdaData.boxed_warning?.[0]?.substring(0, 800) || "N/A"}
- Dosage: ${fdaData.dosage_and_administration?.[0]?.substring(0, 800) || "N/A"}
- Contraindications: ${fdaData.contraindications?.[0]?.substring(0, 800) || "N/A"}
` : "No FDA label data found — use general medical knowledge and note that clearly."}

${userContext ? `Patient Context: ${userContext}` : ""}

Return ONLY valid JSON with no markdown or code blocks:
{
  "overview": "2-3 sentence plain-English description of what this medication is, what it treats, and how it works.",
  "warnings": "Key warnings, contraindications, and precautions a patient must know. Be specific.",
  "dosing": "Common dosing: typical dose, frequency, administration route, and timing notes.",
  "interactions": "Important drug interactions, food interactions, or substances to avoid."
}`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    let sections;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      sections = JSON.parse(cleaned);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      sections = match ? JSON.parse(match[0]) : { overview: rawText, warnings: null, dosing: null, interactions: null };
    }

    const clinicalReferences: Array<{
      title: string;
      url: string;
      source: string;
      badge: string;
      metadata?: string;
    }> = [];

    if (fdaData) {
      clinicalReferences.push({
        title: `FDA Drug Label — ${fdaData.openfda?.brand_name?.[0] || medicationName}`,
        url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${fdaData.openfda?.application_number?.[0] || ""}`,
        source: "U.S. Food & Drug Administration",
        badge: "FDA Verified",
        metadata: fdaData.openfda?.generic_name?.[0]
          ? `Generic name: ${fdaData.openfda.generic_name[0]}`
          : undefined,
      });
    }

    clinicalReferences.push({
      title: `DailyMed — ${medicationName}`,
      url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(medicationName)}`,
      source: "NLM / DailyMed",
      badge: "NLM",
      metadata: "National Library of Medicine drug label database",
    });

    return NextResponse.json({
      medication: medicationName,
      sections,
      clinicalReferences,
    });
  } catch (error) {
    console.error("Error generating medication insights:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
