import { NextRequest, NextResponse } from 'next/server'
import { groq } from '@/lib/groq/client'
import { toFile } from 'groq-sdk'

export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType } = await req.json()

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
      model: 'whisper-large-v3',
      language: 'en',
      response_format: 'json',
    })

    return NextResponse.json({ transcript: transcription.text?.trim() || '' })
  } catch (error: any) {
    console.error('Transcription error:', error)
    if (error?.status === 429) {
      return NextResponse.json({ error: 'Rate limit reached. Please try again shortly.' }, { status: 429 })
    }
    return NextResponse.json({ error: error.message || 'Transcription failed' }, { status: 500 })
  }
}
