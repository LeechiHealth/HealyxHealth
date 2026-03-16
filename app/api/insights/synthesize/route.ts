import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { groq, GROQ_MODEL } from "@/lib/groq/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

async function fetchAbstractWithTimeout(pmid: string, timeoutMs = 2000): Promise<string> {
  const fetchPromise = fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`
  ).then((res) => (res.ok ? res.text() : ""));
  fetchPromise.catch(() => {});
  const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs));
  try {
    const text = await Promise.race([fetchPromise, timeoutPromise]);
    return (text || "").substring(0, 2000);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const { result, userContext, userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Check cache first
    const { data: cached } = await supabase
      .from("insight_cache")
      .select("plain_summary, key_findings, profile_relevance, what_to_discuss")
      .eq("user_id", userId)
      .eq("result_id", result.id)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ sections: cached, cached: true });
    }

    // Fetch abstract for pubmed results
    const abstractText = result.pmid && !result.abstract
      ? await fetchAbstractWithTimeout(result.pmid, 2000)
      : (result.abstract || "");

    // Build profile context
    const hasProfile = userContext && (
      userContext.conditions?.length > 0 ||
      userContext.medications?.length > 0 ||
      userContext.biomarkers?.length > 0
    );

    const profileBlock = hasProfile
      ? `Conditions: ${userContext.conditions?.map((c: { name: string }) => c.name).join(", ") || "None"} | Meds: ${
          userContext.medications?.map((m: { name: string; dosage?: string }) =>
            `${m.name}${m.dosage ? ` (${m.dosage})` : ""}`
          ).join(", ") || "None"
        }`
      : "No profile data.";

    const prompt = `Analyze this health research for a patient. Be concise and in plain English.
Title: ${result.title}
Source: ${result.source}
${abstractText ? `Abstract: ${abstractText.substring(0, 1500)}` : ""}
Patient profile: ${profileBlock}

Return a JSON object (no markdown, no code blocks) with these exact keys:
{"plain_summary":"1-2 sentences: what was studied and the key result","key_findings":"1 sentence: most important finding, include numbers if available","profile_relevance":"How this applies to the patient's conditions/meds. If no connection, say No direct relevance.","what_to_discuss":"1-2 specific questions the patient should ask their doctor"}`;

    let sections;

    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: "You are a medical research summarizer. Always return valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
        max_tokens: 512,
        temperature: 0.3,
      });

      const rawText = completion.choices[0]?.message?.content?.trim() || "";

      try {
        const cleaned = rawText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        sections = JSON.parse(cleaned);
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        sections = match
          ? JSON.parse(match[0])
          : {
              plain_summary: rawText.substring(0, 500),
              key_findings: null,
              profile_relevance: null,
              what_to_discuss: null,
            };
      }
    } catch (aiError: unknown) {
      const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
      console.error("Groq synthesis failed:", errMsg);

      const isQuota = errMsg.includes("429") || errMsg.includes("rate") || errMsg.includes("limit");

      sections = {
        plain_summary: isQuota
          ? "AI synthesis rate limit reached. Try again in a moment."
          : `${result.title} — ${result.source}${result.date ? ` (${result.date})` : ""}.`,
        key_findings: isQuota ? "Groq free tier: 14,400 requests/day limit." : null,
        profile_relevance: null,
        what_to_discuss: null,
      };
    }

    // Cache the synthesis
    await supabase.from("insight_cache").insert({
      user_id: userId,
      result_id: result.id,
      result_type: result.type,
      result_title: result.title,
      result_source: result.source,
      plain_summary: sections.plain_summary,
      key_findings: sections.key_findings,
      profile_relevance: sections.profile_relevance,
      what_to_discuss: sections.what_to_discuss,
    });

    return NextResponse.json({ sections, cached: false });
  } catch (error: unknown) {
    console.error("Synthesis route error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Synthesis failed", details: message }, { status: 500 });
  }
}
