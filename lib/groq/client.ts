import Groq from 'groq-sdk'

// Shared Groq client — used across all server-side AI routes.
// Model: llama-3.3-70b-versatile — best free Groq model for health/medical reasoning.
// Free tier: 14,400 requests/day, 6,000 tokens/min (no credit card needed).
// Get your free key at: https://console.groq.com
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export const GROQ_MODEL = 'llama-3.3-70b-versatile'
