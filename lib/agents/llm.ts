// Provider-agnostic chat with tool calling over the OpenAI-compatible API that
// Groq, Gemini, OpenRouter, Together and local open-source servers all speak.
// Providers are tried in order; a rate limit or outage falls through to the next.

export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string }; extra_content?: { google?: { thought_signature?: string } } & Record<string, unknown> }
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}
export interface ToolSchema { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: ToolSchema[]
  tool_choice?: "auto" | "none" | "required"
  max_tokens?: number
  temperature?: number
}

interface Provider { name: string; url: string; key: string; model: string }

type Env = Record<string, string | undefined>

export function agentProviders(env: Env = process.env): Provider[] {
  const list: Provider[] = []
  // An explicit OpenAI-compatible endpoint (for example an open-source model host) goes first.
  if (env.AGENT_LLM_URL?.trim() && env.AGENT_LLM_KEY?.trim() && env.AGENT_LLM_MODEL?.trim()) {
    list.push({ name: "custom", url: env.AGENT_LLM_URL.trim(), key: env.AGENT_LLM_KEY.trim(), model: env.AGENT_LLM_MODEL.trim() })
  }
  if (env.GROQ_API_KEY?.trim()) {
    list.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY.trim(), model: env.AGENT_MODEL?.trim() || env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b" })
  }
  if (env.GEMINI_API_KEY?.trim()) {
    // Fast model first, then the stronger one. gemini-2.5-flash is overloaded and 2.5-flash-lite is retired for new keys.
    const models = (env.GEMINI_AGENT_MODELS || env.GEMINI_AGENT_MODEL || "gemini-3.5-flash-lite,gemini-3.5-flash").split(",").map(m => m.trim()).filter(Boolean)
    for (const model of models) list.push({ name: `gemini:${model}`, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: env.GEMINI_API_KEY.trim(), model })
  }
  return list
}

export class LlmError extends Error {
  status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

// Gemini 3 rejects a tool-call turn sent back without its thought signature. Google documents this
// placeholder for calls that came from another model (a run that switched providers mid-way).
const SIGNATURE_PLACEHOLDER = "skip_thought_signature_validator"

/** Keeps only fields the provider accepts when a message is sent back. */
export function cleanMessage(message: ChatMessage, forGemini = false): ChatMessage {
  const clean: ChatMessage = { role: message.role, content: message.content ?? null }
  if (message.tool_calls?.length) {
    clean.tool_calls = message.tool_calls.map(call => {
      const base: ToolCall = { id: call.id, type: "function", function: { name: call.function.name, arguments: call.function.arguments || "{}" } }
      if (!forGemini) return base
      return { ...base, extra_content: call.extra_content?.google?.thought_signature ? call.extra_content : { google: { thought_signature: SIGNATURE_PLACEHOLDER } } }
    })
  }
  if (message.tool_call_id) clean.tool_call_id = message.tool_call_id
  return clean
}

export async function chat(request: ChatRequest, env: Env = process.env): Promise<{ message: ChatMessage; provider: string }> {
  const providers = agentProviders(env)
  if (!providers.length) throw new LlmError("AI_NOT_CONFIGURED", 503)
  let lastError: LlmError = new LlmError("AI_UNAVAILABLE", 503)
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({ model: provider.model, ...request, messages: request.messages.map(m => cleanMessage(m, provider.name.startsWith("gemini"))) }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new LlmError(`${provider.name} returned ${response.status}`, response.status)
      const data = await response.json()
      const message = data?.choices?.[0]?.message as ChatMessage | undefined
      if (!message) throw new LlmError(`${provider.name} returned no message`, 502)
      return { message, provider: provider.name }
    } catch (error) {
      lastError = error instanceof LlmError ? error : new LlmError(String((error as Error)?.message || error), 503)
      // Status only, never content: shows in Vercel logs which provider is failing and why.
      console.warn(`[agents] ${provider.name} (${provider.model}) failed: ${lastError.status ?? "network"}`)
    }
  }
  throw lastError
}
