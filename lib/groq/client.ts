import Groq from 'groq-sdk'

let client: Groq | undefined

// Initialize on the first request so missing server configuration does not crash
// route imports or prevent the rest of the dashboard from loading.
export const groq = new Proxy({} as Groq, {
  get(_target, property) {
    if (!client) {
      if (!process.env.GROQ_API_KEY?.trim()) {
        throw new Error('AI_NOT_CONFIGURED')
      }
      client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 45_000, maxRetries: 1 })
    }
    const value = Reflect.get(client, property)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

// Groq retired llama-3.3-70b-versatile. Override with GROQ_MODEL without a code change.
export const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b'

// Groq retired meta-llama/llama-4-scout-17b-16e-instruct. Override with GROQ_VISION_MODEL.
export const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b'

/** Removes any <think> reasoning block some models put before the answer. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}
