import { NextRequest, NextResponse } from 'next/server'
import { groq } from '@/lib/groq/client'
import { toFile } from 'groq-sdk'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/serverAuth'

const TranscribeSchema = z.object({
  base64: z.string().min(1).max(15_000_000),
  mimeType: z.string().max(100).optional(),
})

export async function POST(req: NextRequest) {
  // Signed-in users only, so the server's Groq credential can't be used anonymously.
  const auth = await authenticateRequest(req)
  if (auth.response) return auth.response
  try {
    const body = await req.json()
    const parsed = TranscribeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { base64, mimeType } = parsed.data

    if (!base64) {
      return NextResponse.json({ error: 'Audio data required' }, { status: 400 })
    }

    const buffer = Buffer.from(base64, 'base64')
    // Derive file extension from mimeType so Whisper can identify the codec correctly
    const ext = (mimeType || 'audio/webm').includes('mp4') ? 'mp4'
      : (mimeType || '').includes('ogg') ? 'ogg'
      : (mimeType || '').includes('wav') ? 'wav'
      : 'webm'
    const audioFile = await toFile(buffer, `recording.${ext}`, { type: mimeType || 'audio/webm' })

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      // Groq retired distil-whisper-large-v3-en.
      model: process.env.GROQ_WHISPER_MODEL?.trim() || 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'json',
      // Prompt reduces hallucinations by setting context for Whisper
      prompt: 'Medical visit notes, symptoms, diagnoses, medications, and health discussions.',
    })

    const text = transcription.text?.trim() || ''

    // Whisper hallucinates these phrases on silent/short audio — reject them
    const HALLUCINATIONS = [
      'you', 'You', 'you.', 'You.',
      'Thank you.', 'Thank you for watching.',
      'Thank you for watching!', 'Thanks for watching.',
      'Thanks for watching!', 'Bye.', 'Bye!',
      'Subscribe.', 'Like and subscribe.',
      'www.', '.com', 'subtitles by', 'Subtitles by',
    ]
    const isHallucination = HALLUCINATIONS.some(h =>
      text.toLowerCase() === h.toLowerCase()
    ) || text.length <= 2

    if (isHallucination) {
      return NextResponse.json({ transcript: '' })
    }

    return NextResponse.json({ transcript: text })
  } catch (error: any) {
    console.error('Transcription error:', error)
    if (error?.status === 429) {
      return NextResponse.json({ error: 'Rate limit reached. Please try again shortly.' }, { status: 429 })
    }
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 })
  }
}
