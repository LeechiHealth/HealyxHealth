import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/serverAuth"
import type { AgentId } from "@/lib/agents/config"
import { agentProviders } from "@/lib/agents/llm"
import { loadRecords } from "@/lib/agents/records"
import { runAgent, type Step } from "@/lib/agents/runtime"
import { RunRequest } from "@/lib/agents/schema"
import { detectUrgent, guardSpending, honestReply, HONEST_FALLBACK_REPLY, URGENT_REPLIES } from "@/lib/agents/safety"
import type { AgentTask, NewTask } from "@/lib/agents/tasks"
import type { AgentContext } from "@/lib/agents/tools"

// Agents browse and chain tools, so a run can take a couple of minutes.
export const maxDuration = 300

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/** Strict base64 check plus decoded size, the same rules as /api/chat. */
function imageProblem(image: { data: string }): string | null {
  const data = image.data
  if (!data || data.length % 4 !== 0 || !BASE64_RE.test(data)) return "Each photo must be base64 encoded."
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  if ((data.length / 4) * 3 - padding > MAX_IMAGE_BYTES) return "Each photo must be 4 MB or smaller."
  return null
}

type Place = { lat: number; lon: number; city?: string; zip?: string; state?: string }

/**
 * The app sends rounded coordinates; the NPI registry needs a city or ZIP. A free reverse
 * geocoder fills those in (best effort, 3 s). Only the rounded coordinates leave the server.
 */
async function withPlace(location: Place | undefined, fetcher: typeof fetch = fetch): Promise<Place | undefined> {
  if (!location || (location.city && location.zip)) return location
  try {
    const lat = Math.round(location.lat * 100) / 100
    const lon = Math.round(location.lon * 100) / 100
    const response = await fetcher(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) return location
    const data = await response.json()
    const zip = typeof data?.postcode === "string" && /^\d{5}/.test(data.postcode) ? data.postcode.slice(0, 5) : undefined
    const state = typeof data?.principalSubdivisionCode === "string" ? data.principalSubdivisionCode.replace(/^US-/, "") : undefined
    return { ...location, city: location.city || data?.city || data?.locality || undefined, zip: location.zip || zip, state }
  } catch {
    return location
  }
}

/** "Tampa (ZIP 33647)" from the rounded device location, for the prompt only. */
function placeFrom(location?: { city?: string; zip?: string }): string | undefined {
  if (!location) return undefined
  const parts = [location.city, location.zip ? `ZIP ${location.zip}` : undefined].filter(Boolean)
  if (!parts.length) return undefined
  return location.city && location.zip ? `${location.city} (ZIP ${location.zip})` : parts.join(" ")
}

const localId = () => `local-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
const missingColumn = (error: { code?: string; message?: string } | null) => Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message || "")))

async function persist(db: any, userId: string, agent: AgentId, userText: string, reply: string, tasks: NewTask[], meta: Record<string, unknown>): Promise<{ persisted: boolean; tasks: AgentTask[] }> {
  const local = () => tasks.map(task => ({ ...task, id: localId(), created_at: new Date().toISOString(), local: true }))
  const now = Date.now()
  const rows = [
    { user_id: userId, agent, role: "user", content: userText, created_at: new Date(now - 1).toISOString() },
    { user_id: userId, agent, role: "assistant", content: reply, created_at: new Date(now).toISOString(), meta },
  ]
  let messages = await db.from("agent_messages").insert(rows)
  // Before the meta column migration runs, save the conversation without the step history.
  if (missingColumn(messages.error)) messages = await db.from("agent_messages").insert(rows.map(({ meta: _meta, ...row }: any) => row))
  if (messages.error) return { persisted: false, tasks: local() }
  if (!tasks.length) return { persisted: true, tasks: [] }
  const saved = await db.from("agent_tasks").insert(tasks.map(task => ({ ...task, user_id: userId }))).select("*")
  if (saved.error || !saved.data) return { persisted: false, tasks: local() }
  return { persisted: true, tasks: saved.data }
}

function friendlyError(error: unknown): string {
  const status = (error as { status?: number })?.status
  if (status === 429 || status === 503) return "The AI providers are at their limits right now. Please try again in a few minutes."
  if ((error as Error)?.message === "AI_NOT_CONFIGURED") return "Agents are not connected yet. The site administrator needs to configure an AI provider key."
  return "Agents are temporarily unavailable. Please try again."
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (auth.response) return auth.response
  const { user, supabase: db } = auth

  const parsed = RunRequest.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Send a message of up to 2,000 characters to one of the current agents, with at most 3 photos." }, { status: 400 })
  const input = parsed.data
  for (const image of input.images || []) {
    const problem = imageProblem(image)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  // A crisis gets a fixed safety response: nothing is stored or sent to the AI provider.
  // Possible emergencies lead with a 911 notice, then the agent still helps.
  const urgent = detectUrgent(input.message)
  if (urgent === "crisis") return NextResponse.json({ reply: URGENT_REPLIES.crisis, urgent, tasks: [], persisted: false })

  if (!agentProviders().length) {
    return NextResponse.json({ error: "Agents are not connected yet. The site administrator needs to configure an AI provider key." }, { status: 503 })
  }

  // Stream each step as it happens (newline-delimited JSON), then the final result.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      const started = Date.now()
      try {
        const [records, location] = await Promise.all([loadRecords(db, user.id), withPlace(input.location)])
        const ctx: AgentContext = {
          agent: input.agent, userId: user.id, db, records, today: input.now.slice(0, 10), tzOffsetMinutes: input.tzOffsetMinutes,
          question: input.message, tasks: [], updates: [], sources: [], mentions: [], env: process.env, location,
        }
        const result = await runAgent({ agent: input.agent, message: input.message, history: input.history, now: input.now, tz: input.tz, images: input.images, place: placeFrom(location) }, ctx, (step: Step) => send({ type: "step", step }))
        ctx.tasks = ctx.tasks.map(guardSpending)
        const base = result.reply.trim() || (ctx.tasks.length ? HONEST_FALLBACK_REPLY : "I couldn't finish that. Tell me a bit more about what you need.")
        const reply = urgent === "emergency" ? `${URGENT_REPLIES.emergency}\n\n${honestReply(base)}` : honestReply(base)
        const meta = {
          duration_ms: Date.now() - started,
          steps: result.steps.map(({ label, status }) => ({ label, status })),
          sources: ctx.sources.filter(s => s.kind === "web").slice(0, 6).map(({ title, url }) => ({ title, url })),
          provider: result.provider,
        }
        // Photos are read for this run only; the saved message notes them without storing the images.
        const userText = input.images?.length ? `${input.message}\n[${input.images.length} photo${input.images.length > 1 ? "s" : ""} attached]` : input.message
        const saved = await persist(db, user.id, input.agent, userText, reply, ctx.tasks, meta)
        send({ type: "done", reply, tasks: saved.tasks, updates: ctx.updates, persisted: saved.persisted, meta, ...(urgent ? { urgent } : {}) })
      } catch (error) {
        send({ type: "error", error: friendlyError(error) })
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}
