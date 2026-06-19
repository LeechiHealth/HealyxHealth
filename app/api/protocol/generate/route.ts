import { NextRequest, NextResponse } from "next/server"
import { groq, GROQ_MODEL } from "@/lib/groq/client"
import { z } from "zod"

// The protocol generator turns a user's health record into a SHORT, prioritized,
// plain-English action plan (the Healyx Wellness Protocol). It does NOT diagnose.
const RequestSchema = z.object({
  healthSummary: z.string().max(12000),
  goal: z.string().max(500).optional(),
})

const SYSTEM_PROMPT = `You are the protocol engine for HEALYX, a health-intelligence platform.
You convert a person's health record into a SHORT, prioritized, plain-English wellness protocol.

HARD RULES:
- Write at a 6th-grade reading level. No jargon. Warm, direct, not clinical.
- Return 3 to 5 tasks MAX. Ruthlessly prioritized. No 20-item plans.
- Every task must be SPECIFIC and tied to the user's actual data (cite the value/condition that drove it). Never generic ("reduce stress").
- Favor free/low-cost, high-evidence interventions first (movement, food, sleep) before supplements.
- This is educational wellness guidance, NOT medical diagnosis or treatment. Do not prescribe prescription drugs.

Return STRICT JSON ONLY, matching exactly:
{
  "plain_summary": "2-3 sentences: what's going on with this person in plain English",
  "health_score": <integer 0-100 reflecting overall current health>,
  "health_score_target": <integer 0-100, a realistic 12-week target>,
  "issues_ranked": [ { "issue": "short label", "severity": "high|medium|low", "why": "one plain sentence" } ],
  "tasks": [
    {
      "task_name": "short imperative, e.g. 'Walk 15 min after lunch'",
      "description": "1 sentence on exactly what to do",
      "why_it_matters": "1 plain sentence tied to their data",
      "category": "movement|nutrition|supplement|sleep|stress|avoid|tracking",
      "frequency": "e.g. 'Daily', '2x/week', 'Every night'",
      "priority": 1,
      "evidence_level": "strong|moderate|weak",
      "cost_estimate": "e.g. '$0', '~$10/month'"
    }
  ]
}`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { healthSummary, goal } = parsed.data

    const userPrompt = `Here is the person's health record:\n${healthSummary}\n${goal ? `\nTheir stated goal: ${goal}` : ""}\n\nGenerate their Healyx Wellness Protocol as strict JSON.`

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1600,
      temperature: 0.5,
      response_format: { type: "json_object" },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: "Empty response from model" }, { status: 502 })
    }

    let protocol: any
    try {
      protocol = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "Model returned malformed JSON" }, { status: 502 })
    }

    // Light normalization / guards
    const clamp = (n: any, d: number) => {
      const v = Math.round(Number(n))
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d
    }
    const okCat = ["movement", "nutrition", "supplement", "sleep", "stress", "avoid", "tracking"]
    const okEv = ["strong", "moderate", "weak"]

    const tasks = Array.isArray(protocol.tasks) ? protocol.tasks.slice(0, 5).map((t: any, i: number) => ({
      task_name: String(t.task_name || "Untitled task").slice(0, 200),
      description: t.description ? String(t.description).slice(0, 500) : null,
      why_it_matters: t.why_it_matters ? String(t.why_it_matters).slice(0, 500) : null,
      category: okCat.includes(t.category) ? t.category : "tracking",
      frequency: t.frequency ? String(t.frequency).slice(0, 60) : "Daily",
      priority: [1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : (i < 3 ? 1 : 2),
      evidence_level: okEv.includes(t.evidence_level) ? t.evidence_level : "moderate",
      cost_estimate: t.cost_estimate ? String(t.cost_estimate).slice(0, 40) : null,
      sort_order: i,
    })) : []

    if (tasks.length === 0) {
      return NextResponse.json({ error: "No tasks generated" }, { status: 502 })
    }

    return NextResponse.json({
      plain_summary: protocol.plain_summary ? String(protocol.plain_summary).slice(0, 1200) : null,
      health_score: clamp(protocol.health_score, 50),
      health_score_target: clamp(protocol.health_score_target, 75),
      issues_ranked: Array.isArray(protocol.issues_ranked) ? protocol.issues_ranked.slice(0, 6) : [],
      tasks,
    })
  } catch (error: unknown) {
    const raw = error as any
    const status: number = raw?.status ?? 500
    if (status === 429) {
      return NextResponse.json({ error: "Rate limit reached. Please wait a moment and try again." }, { status: 429 })
    }
    console.error(`[protocol/generate] ${status}: ${raw?.message}`)
    return NextResponse.json({ error: raw?.message || "Failed to generate protocol" }, { status: 500 })
  }
}
