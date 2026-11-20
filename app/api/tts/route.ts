import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/serverAuth'

// Natural speech for the native app's voice mode, using Gemini's TTS models.
// Returns a WAV file (24 kHz, mono, 16-bit PCM).

import { DEFAULT_VOICE, VOICES, STYLE, MAX_CHARS, allowRequest, findAudio, toWav } from '@/lib/tts'

const TtsSchema = z.object({
  text: z.string().min(1).max(MAX_CHARS),
  voice: z.string().max(40).optional(),
}).strict()

async function interactionsTts(text: string, voice: string, key: string, model: string) {
  return fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
  })
}

async function generateContentTts(text: string, voice: string, key: string, model: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say in a ${STYLE} voice: ${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (auth.response) return auth.response
  const parsed = TtsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `Send text of up to ${MAX_CHARS} characters.` }, { status: 400 })
  const key = process.env.GEMINI_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: 'Voice needs the Gemini key set on the server.', code: 'AI_NOT_CONFIGURED' }, { status: 503 })
  if (!allowRequest(auth.user.id)) return NextResponse.json({ error: 'Too many voice requests. Please wait a moment.' }, { status: 429 })

  const text = parsed.data.text.trim()
  const voice = parsed.data.voice && VOICES.has(parsed.data.voice) ? parsed.data.voice : DEFAULT_VOICE
  const attempts: Array<() => Promise<Response>> = [
    () => interactionsTts(text, voice, key, process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-tts'),
    () => generateContentTts(text, voice, key, process.env.GEMINI_TTS_FALLBACK_MODEL?.trim() || 'gemini-2.5-flash-preview-tts'),
  ]

  let lastStatus = 502
  for (const attempt of attempts) {
    try {
      const response = await attempt()
      lastStatus = response.status
      if (!response.ok) continue
      const audio = findAudio(await response.json())
      if (!audio) { lastStatus = 502; continue }
      const wav = toWav(audio)
      return new NextResponse(new Uint8Array(wav), {
        status: 200,
        headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length), 'Cache-Control': 'no-store' },
      })
    } catch {
      lastStatus = 502
    }
  }
  console.error('[tts/route] Speech generation failed', { status: lastStatus })
  if (lastStatus === 429) return NextResponse.json({ error: 'Voice is busy. Please try again in a moment.' }, { status: 429 })
  return NextResponse.json({ error: 'Voice could not be generated right now.' }, { status: 502 })
}
