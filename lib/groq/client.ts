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

export const GROQ_MODEL = 'llama-3.3-70b-versatile'
