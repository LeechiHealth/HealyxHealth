import { NextRequest, NextResponse } from 'next/server'
import { groq, GROQ_MODEL } from '@/lib/groq/client'

// Vision-capable model for image analysis
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

async function extractPdfText(base64: string): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs' as any)
    pdfjs.GlobalWorkerOptions.workerSrc = ''
    const buffer = Buffer.from(base64, 'base64')
    const uint8 = new Uint8Array(buffer)
    const pdf = await pdfjs.getDocument({
      data: uint8,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise
    let text = ''
    for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n'
    }
    return text.trim().substring(0, 5000)
  } catch {
    return ''
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, fileData, conversationHistory } = body

    if (!message && !fileData) {
      return NextResponse.json({ error: 'Message or file required' }, { status: 400 })
    }

    const isImage = fileData?.mimeType?.startsWith('image/')
    const isPdf = fileData?.mimeType === 'application/pdf'
    const userText = message?.trim() || ''

    // Build conversation history messages
    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (Array.isArray(conversationHistory)) {
      for (const turn of conversationHistory.slice(-10)) {
        if (turn.role === 'user' || turn.role === 'assistant') {
          historyMessages.push({ role: turn.role, content: String(turn.content) })
        }
      }
    }

    // ── Image files: use vision model ─────────────────────────────────────────
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

    // ── PDF files: extract text then query ────────────────────────────────────
    let userContent = userText
    if (isPdf && fileData?.base64) {
      const extracted = await extractPdfText(fileData.base64)
      if (extracted && extracted.length > 20) {
        userContent = `[PDF attached: ${fileData.name || 'document.pdf'}]\n\nExtracted content:\n${extracted}\n\n${userText || 'Please analyze this document and explain what it shows in the context of my health. Highlight key findings and what I should discuss with my doctor.'}`
      } else {
        userContent = `[PDF attached: ${fileData.name || 'document.pdf'}] — I could not extract text from this file (it may be a scanned image). ${userText || 'Can you help me understand what I should look for in this type of document?'}`
      }
    } else if (fileData) {
      // Other file types
      userContent = `[File attached: ${fileData.name || 'file'}]\n\n${userText || 'Please help me understand this document in the context of my health.'}`
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
    console.error(`[chat/route] error — ${status}: ${msg}`)
    if (status === 429) {
      return NextResponse.json(
        { error: 'Rate limit reached. Please wait a moment and try again.' },
        { status: 429 }
      )
    }
    return NextResponse.json({ error: msg }, { status: status >= 400 && status < 600 ? status : 500 })
  }
}
