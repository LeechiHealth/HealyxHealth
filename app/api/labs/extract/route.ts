import { NextRequest, NextResponse } from 'next/server'
import { groq, GROQ_MODEL } from '@/lib/groq/client'
import { inflateSync, inflateRawSync } from 'zlib'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

// ── PDF text extraction — byte-level Buffer parsing ─────────────────────────
// String regex fails on binary PDF streams. We use Buffer.indexOf() to locate
// stream start/end positions precisely, then decompress with Node built-in zlib.

function findPDFStreams(buf: Buffer): Buffer[] {
  const SB = Buffer.from('stream')
  const EB = Buffer.from('endstream')
  const streams: Buffer[] = []
  let pos = 0

  while (pos < buf.length) {
    const streamPos = buf.indexOf(SB, pos)
    if (streamPos === -1) break

    // Skip 'stream' keyword + optional \r\n or \n
    let dataStart = streamPos + SB.length
    if (buf[dataStart] === 0x0d) dataStart++ // \r
    if (buf[dataStart] === 0x0a) dataStart++ // \n

    const endPos = buf.indexOf(EB, dataStart)
    if (endPos === -1) break

    // Trim trailing \r\n before endstream marker
    let dataEnd = endPos
    if (dataEnd > 0 && buf[dataEnd - 1] === 0x0a) dataEnd--
    if (dataEnd > 0 && buf[dataEnd - 1] === 0x0d) dataEnd--

    if (dataEnd > dataStart) {
      streams.push(buf.slice(dataStart, dataEnd))
    }

    pos = endPos + EB.length
  }

  return streams
}

function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1')
}

function extractTextFromDecodedStream(content: string): string {
  const pieces: string[] = []
  const btEtRe = /BT[\s\S]*?ET/g
  let block: RegExpExecArray | null

  while ((block = btEtRe.exec(content)) !== null) {
    const blk = block[0]

    // Literal strings:  (hello) Tj   (hello) '   (hello) "
    const tjRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*(?:Tj|'|")/g
    let m: RegExpExecArray | null
    while ((m = tjRe.exec(blk)) !== null) pieces.push(decodePDFString(m[1]))

    // Array operator:  [(hello) -200 (world)] TJ
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

function extractTextJS(buffer: Buffer): string {
  const streams = findPDFStreams(buffer)
  const allText: string[] = []

  for (const raw of streams) {
    let decoded: Buffer | null = null

    // Try FlateDecode (most common in modern PDFs)
    try { decoded = inflateSync(raw) } catch { /* not flate compressed */ }

    // Try raw deflate (no zlib header)
    if (!decoded) {
      try { decoded = inflateRawSync(raw) } catch { /* not raw deflate */ }
    }

    // Uncompressed — use as-is
    if (!decoded) decoded = raw

    const text = extractTextFromDecodedStream(decoded.toString('latin1'))
    if (text.trim().length > 0) allText.push(text)
  }

  // Also scan the whole buffer uncompressed (catches PDFs with no stream compression)
  const directText = extractTextFromDecodedStream(buffer.toString('latin1'))
  if (directText.trim().length > 0) allText.push(directText)

  return allText.join('\n').replace(/\s+/g, ' ').trim()
}

// ── pdftotext (Linux/Mac in production) ────────────────────────────────────
function extractTextNative(buffer: Buffer): string {
  const id = Date.now()
  const tmpIn = join(tmpdir(), `healyx-${id}.pdf`)
  const tmpOut = join(tmpdir(), `healyx-${id}.txt`)
  try {
    writeFileSync(tmpIn, buffer)
    execSync(`pdftotext -layout -l 10 "${tmpIn}" "${tmpOut}"`, { timeout: 15000 })
    return readFileSync(tmpOut, 'utf-8').trim()
  } finally {
    if (existsSync(tmpIn)) try { unlinkSync(tmpIn) } catch { /* ok */ }
    if (existsSync(tmpOut)) try { unlinkSync(tmpOut) } catch { /* ok */ }
  }
}

async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')

  // 1. pdftotext — Linux/Mac production path, handles all encoding types
  try {
    execSync('pdftotext -v 2>&1', { timeout: 3000 })
    const text = extractTextNative(buffer)
    if (text.length >= 20) return text.substring(0, 6000)
  } catch { /* Windows dev or not installed */ }

  // 2. Pure-JS byte-level extraction — cross-platform, no npm deps
  const text = extractTextJS(buffer)
  return text.substring(0, 6000)
}

// ── Route handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { base64, mimeType, fileName } = await req.json()

    if (!base64) {
      return NextResponse.json({ error: 'File data required' }, { status: 400 })
    }

    let rawText = ''

    if (mimeType === 'application/pdf') {
      rawText = await extractPdfText(base64)
    } else if (mimeType?.startsWith('text/')) {
      rawText = Buffer.from(base64, 'base64').toString('utf-8').substring(0, 4000)
    } else {
      rawText = `[File: ${fileName}]`
    }

    if (!rawText || rawText.length < 20) {
      return NextResponse.json({
        biomarkers: [],
        message: 'Could not extract text from this PDF. If it is a scanned document, upload it as a JPG or PNG image instead — the AI can read images directly.',
      })
    }

    const today = new Date().toISOString().split('T')[0]

    const prompt = `You are a medical lab report parser. Extract all biomarkers/test results from the following lab report text.

Return ONLY a valid JSON array (no markdown, no code blocks, no explanation). Each item:
- name: string (e.g. "Glucose", "HDL Cholesterol", "TSH", "Hemoglobin A1c")
- value: number (numeric only)
- unit: string (e.g. "mg/dL", "%", "IU/L")
- test_date: string YYYY-MM-DD (use ${today} if not found)
- reference_range_text: string or null (e.g. "70-99 mg/dL")
- status: "optimal"|"normal"|"borderline"|"high"|"low"|"critical"|null

Lab report:
${rawText}

JSON:`

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Extract lab biomarkers. Return only a JSON array.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    })

    const rawResponse = completion.choices[0]?.message?.content?.trim() || '[]'

    let biomarkers: any[] = []
    try {
      const cleaned = rawResponse
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      biomarkers = JSON.parse(cleaned)
      if (!Array.isArray(biomarkers)) biomarkers = []
    } catch {
      const match = rawResponse.match(/\[[\s\S]*\]/)
      if (match) { try { biomarkers = JSON.parse(match[0]) } catch { biomarkers = [] } }
    }

    biomarkers = biomarkers
      .filter((b: any) => b.name && b.value !== undefined && b.value !== null)
      .map((b: any) => ({
        name: String(b.name).trim(),
        value: parseFloat(b.value),
        unit: String(b.unit || '').trim(),
        test_date: b.test_date || today,
        reference_range_text: b.reference_range_text || null,
        status: b.status || null,
      }))
      .filter((b: any) => !isNaN(b.value))

    return NextResponse.json({ biomarkers })

  } catch (error: any) {
    console.error('Labs extract error:', error)
    if (error?.status === 429) {
      return NextResponse.json({ error: 'Rate limit reached. Please try again shortly.' }, { status: 429 })
    }
    return NextResponse.json({ error: error.message || 'Extraction failed' }, { status: 500 })
  }
}
