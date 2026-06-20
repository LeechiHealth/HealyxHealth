import { NextRequest, NextResponse } from "next/server"
import { groq, GROQ_MODEL } from "@/lib/groq/client"
import { z } from "zod"

// The protocol generator turns a user's full health record + questionnaire into a
// clear, plain-English BASELINE REPORT + a 4-week action plan (the Healyx Wellness
// Protocol). It does NOT diagnose. Structure: what's going on → what the research
// says → what to do for the next 4 weeks → then we redo it.
const RequestSchema = z.object({
  healthSummary: z.string().max(12000),
  goal: z.string().max(500).optional(),
})

const SYSTEM_PROMPT = `You are the protocol engine for HEALYX. You turn a person's health record + questionnaire into a clear, warm BASELINE REPORT that even someone with zero medical background can follow like a pro. It is a one-stop plan.

VOICE & RULES:
- 6th-grade reading level. Warm, plain, encouraging. No jargon — if you name a number, say what it means in everyday words.
- Be specific to THIS person's actual data. Never generic. Tie every point to a value, condition, or questionnaire answer.
- The plan is a 4-WEEK block (we redo it roughly monthly). Frame actions as "for the next 4 weeks."
- 3 to 5 actions MAX, ruthlessly prioritized. Free/high-evidence first (movement, food, sleep) before supplements. No prescription drugs.
- Educational wellness guidance, NOT diagnosis or treatment.

Return STRICT JSON ONLY, exactly this shape:
{
  "plain_summary": "1-2 sentence headline of where they stand",
  "health_score": <integer 0-100>,
  "health_score_target": <integer 0-100, realistic after 4-12 weeks>,
  "whats_going_on": "2-4 sentences, the big picture in plain English: what's going well, what's off, and why it matters for how they feel and their long-term health",
  "strengths": ["short plain phrase of something that looks good", "..."],
  "concerns": [
    {
      "label": "short name of the issue (e.g. 'High LDL cholesterol')",
      "plain": "1-2 sentences explaining what it means in everyday words and why it matters",
      "research": "1 plain sentence on what the evidence/guidelines say about fixing it"
    }
  ],
  "four_week_focus": "1-2 sentences naming the single most important focus for the next 4 weeks",
  "what_changes_next": "1 sentence on what we'll re-check in ~4 weeks and how the plan will adapt",
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
}
Aim for 2-4 strengths, 2-4 concerns, and 3-5 tasks.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { healthSummary, goal } = parsed.data

    const userPrompt = `Here is the person's health record and questionnaire:\n${healthSummary}\n${goal ? `\nTheir stated goal: ${goal}` : ""}\n\nWrite their Healyx baseline report + 4-week protocol as strict JSON.`

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2600,
      temperature: 0.5,
      response_format: { type: "json_object" },
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json({ error: "Empty response from model" }, { status: 502 })

    let p: any
    try { p = JSON.parse(raw) } catch { return NextResponse.json({ error: "Model returned malformed JSON" }, { status: 502 }) }

    const clamp = (n: any, d: number) => {
      const v = Math.round(Number(n))
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : d
    }
    const str = (v: any, n: number) => (v ? String(v).slice(0, n) : null)
    const okCat = ["movement", "nutrition", "supplement", "sleep", "stress", "avoid", "tracking"]
    const okEv = ["strong", "moderate", "weak"]

    const tasks = Array.isArray(p.tasks) ? p.tasks.slice(0, 5).map((t: any, i: number) => ({
      task_name: String(t.task_name || "Untitled task").slice(0, 200),
      description: str(t.description, 500),
      why_it_matters: str(t.why_it_matters, 500),
      category: okCat.includes(t.category) ? t.category : "tracking",
      frequency: t.frequency ? String(t.frequency).slice(0, 60) : "Daily",
      priority: [1, 2, 3].includes(Number(t.priority)) ? Number(t.priority) : (i < 3 ? 1 : 2),
      evidence_level: okEv.includes(t.evidence_level) ? t.evidence_level : "moderate",
      cost_estimate: str(t.cost_estimate, 40),
      sort_order: i,
    })) : []

    if (tasks.length === 0) return NextResponse.json({ error: "No tasks generated" }, { status: 502 })

    const report = {
      whats_going_on: str(p.whats_going_on, 1500),
      strengths: Array.isArray(p.strengths) ? p.strengths.map((s: any) => String(s).slice(0, 200)).slice(0, 5) : [],
      concerns: Array.isArray(p.concerns) ? p.concerns.slice(0, 5).map((c: any) => ({
        label: str(c.label, 120),
        plain: str(c.plain, 600),
        research: str(c.research, 600),
      })) : [],
      four_week_focus: str(p.four_week_focus, 600),
      what_changes_next: str(p.what_changes_next, 400),
    }

    return NextResponse.json({
      plain_summary: str(p.plain_summary, 1200),
      health_score: clamp(p.health_score, 50),
      health_score_target: clamp(p.health_score_target, 75),
      issues_ranked: Array.isArray(p.issues_ranked) ? p.issues_ranked.slice(0, 6) : [],
      report,
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
