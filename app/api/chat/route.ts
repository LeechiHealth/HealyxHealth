import { NextRequest, NextResponse } from 'next/server'
import { groq, GROQ_MODEL } from '@/lib/groq/client'
import { z } from 'zod'
import { inflateSync, inflateRawSync } from 'zlib'

const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

const SYSTEM_PROMPT = `You are a helpful, empathetic health assistant for HEALYX, a personal health intelligence platform.

You help users understand:
- Biomarkers and lab results (reference ranges, what values mean, trends)
- Vitals, medications, and health conditions
- Uploaded files: lab reports, imaging notes, prescription documents, photos of results

When analyzing uploaded documents or images:
1. Identify key findings clearly
2. Explain what the values mean in plain language
3. Note anything that may warrant follow-up with a doctor
4. Remind users that HEALYX is for information — always consult a healthcare professional for diagnosis/treatment

Be concise, warm, and evidence-based.`

// ── Input validation schema ────────────────────────────────────────────────
const ChatSchema = z.object({
  message: z.string().max(4000).optional(),
  fileData: z.object({
    base64: z.string().max(15_000_000), // ~10MB base64
    mimeType: z.string().max(100),
    name: z.string().max(255).optional(),
  }).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional(),
})

// ── PDF text extraction (same zlib approach as labs/extract) ───────────────
function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1')
}

function extractTextFromStream(content: string): string {
  const pieces: string[] = []
  const btEtRe = /BT[\s\S]*?ET/g
  let block: RegExpExecArray | null
  while ((block = btEtRe.exec(content)) !== null) {
    const blk = block[0]
    const tjRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*(?:Tj|'|")/g
    let m: RegExpExecArray | null
    while ((m = tjRe.exec(blk)) !== null) pieces.push(decodePDFString(m[1]))
    const tjArrRe = /\[([\s\S]*?)\]\s*TJ/g
    while ((m = tjArrRe.exec(blk)) !== null) {
      const itemRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)/g
      let s: RegExpExecArray | null
      while ((s = itemRe.exec(m[1])) !== null) pieces.push(decodePDFString(s[1]))
    }
    pieces.push(' ')
  }
  return pieces.join('')
}

function extractPdfTextFromBuffer(buffer: Buffer): string {
  const SB = Buffer.from('stream')
  const EB = Buffer.from('endstream')
  const allText: string[] = []
  let pos = 0

  while (pos < buffer.length) {
    const streamPos = buffer.indexOf(SB, pos)
    if (streamPos === -1) break
    let dataStart = streamPos + SB.length
    if (buffer[dataStart] === 0x0d) dataStart++
    if (buffer[dataStart] === 0x0a) dataStart++
    const endPos = buffer.indexOf(EB, dataStart)
    if (endPos === -1) break
    let dataEnd = endPos
    if (dataEnd > 0 && buffer[dataEnd - 1] === 0x0a) dataEnd--
    if (dataEnd > 0 && buffer[dataEnd - 1] === 0x0d) dataEnd--

    if (dataEnd > dataStart) {
      const raw = buffer.slice(dataStart, dataEnd)
      let decoded: Buffer
      try { decoded = inflateSync(raw) }
      catch { try { decoded = inflateRawSync(raw) } catch { decoded = raw } }
      const t = extractTextFromStream(decoded.toString('latin1'))
      if (t.trim()) allText.push(t)
    }
    pos = endPos + EB.length
  }

  allText.push(extractTextFromStream(buffer.toString('latin1')))
  return allText.join('\n').replace(/\s+/g, ' ').trim().substring(0, 5000)
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const parsed = ChatSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { message, fileData, conversationHistory } = parsed.data

    if (!message && !fileData) {
      return NextResponse.json({ error: 'Message or file required' }, { status: 400 })
    }

    const isImage = fileData?.mimeType?.startsWith('image/')
    const isPdf = fileData?.mimeType === 'application/pdf'
    const userText = message?.trim() || ''

    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (Array.isArray(conversationHistory)) {
      for (const turn of conversationHistory.slice(-10)) {
        historyMessages.push({ role: turn.role, content: turn.content })
      }
    }

    // ── Image: vision model ──────────────────────────────────────────────────
    if (isImage && fileData?.base64) {
      const dataUrl = `data:${fileData.mimeType};base64,${fileData.base64}`
      const textPrompt = userText || 'Please analyze this health document or image and explain what it shows. Highlight any important values, findings, or things I should discuss with my doctor.'

      const completion = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historyMessages,
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: textPrompt },
            ],
          } as any,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      })

      const reply = completion.choices[0]?.message?.content?.trim()
      if (!reply) return NextResponse.json({ error: 'Empty response from model' }, { status: 500 })
      return NextResponse.json({ reply })
    }

    // ── PDF: zlib extraction then text query ─────────────────────────────────
    let userContent = userText
    if (isPdf && fileData?.base64) {
      const buffer = Buffer.from(fileData.base64, 'base64')
      const extracted = extractPdfTextFromBuffer(buffer)
      if (extracted && extracted.length > 20) {
        userContent = `[PDF: ${fileData.name || 'document.pdf'}]\n\nContent:\n${extracted}\n\n${userText || 'Please analyze this document and explain the key health findings in plain English.'}`
      } else {
        userContent = `[PDF: ${fileData.name || 'document.pdf'}] — could not extract text (likely a scanned image). ${userText || 'What should I look for in this type of document?'}`
      }
    } else if (fileData) {
      userContent = `[File: ${fileData.name || 'file'}]\n\n${userText || 'Please help me understand this document.'}`
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
        { role: 'user', content: userContent },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    })

    const reply = completion.choices[0]?.message?.content?.trim()
    if (!reply) return NextResponse.json({ error: 'Empty response from model' }, { status: 500 })
    return NextResponse.json({ reply })

  } catch (error: unknown) {
    const raw = error as any
    const status: number = raw?.status ?? raw?.response?.status ?? 500
    const msg: string = raw?.message ?? 'Failed to generate response'
    console.error(`[chat/route] ${status}: ${msg}`)
    if (status === 429) {
      return NextResponse.json({ error: 'Rate limit reached. Please wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: msg }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
