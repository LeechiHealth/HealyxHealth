import { NextRequest, NextResponse } from 'next/server'
import { groq, GROQ_MODEL } from '@/lib/groq/client'
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

// ── Pure-JS PDF text extractor ─────────────────────────────────────────────
// Works cross-platform (Windows/Mac/Linux) with no native dependencies.
// Handles digital lab-report PDFs that contain embedded text streams.
function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\(.)/g, '$1')
}

function extractTextJS(buffer: Buffer): string {
  const content = buffer.toString('latin1')
  const pieces: string[] = []

  // Walk every BT…ET text block
  const textBlockRe = /BT[\s\S]*?ET/g
  let block: RegExpExecArray | null
  while ((block = textBlockRe.exec(content)) !== null) {
    const blk = block[0]

    // Literal string operators:  (text) Tj   (text) '   (text) "
    const litRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)\s*(?:Tj|'|")/g
    let m: RegExpExecArray | null
    while ((m = litRe.exec(blk)) !== null) {
      pieces.push(decodePDFString(m[1]))
    }

    // Array operator:  [(text) -200 (more text)] TJ
    const tjRe = /\[([\s\S]*?)\]\s*TJ/g
    while ((m = tjRe.exec(blk)) !== null) {
      const inner = m[1]
      const strRe = /\(([^)\\]*(?:\\[\s\S][^)\\]*)*)\)/g
      let s: RegExpExecArray | null
      while ((s = strRe.exec(inner)) !== null) {
        pieces.push(decodePDFString(s[1]))
      }
    }

    pieces.push(' ')
  }

  return pieces.join('').replace(/\s+/g, ' ').trim()
}

// ── pdftotext extractor (Linux/Mac only, faster & handles more encodings) ──
function extractTextNative(buffer: Buffer): string {
  const tmpIn = join(tmpdir(), `healyx-${Date.now()}.pdf`)
  const tmpOut = join(tmpdir(), `healyx-${Date.now()}.txt`)
  try {
    writeFileSync(tmpIn, buffer)
    execSync(`pdftotext -layout -l 10 "${tmpIn}" "${tmpOut}"`, { timeout: 15000 })
    return readFileSync(tmpOut, 'utf-8').trim()
  } finally {
    if (existsSync(tmpIn)) unlinkSync(tmpIn)
    if (existsSync(tmpOut)) unlinkSync(tmpOut)
  }
}

async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64')

  // 1. Try pdftotext (available on Linux/Mac in production)
  try {
    execSync('pdftotext -v 2>&1', { timeout: 3000 })
    const text = extractTextNative(buffer)
    if (text.length >= 20) return text.substring(0, 6000)
  } catch {
    // pdftotext not available (Windows dev) — fall through to pure-JS
  }

  // 2. Pure-JS fallback — works everywhere, handles digital PDFs
  try {
    const text = extractTextJS(buffer)
    return text.substring(0, 6000)
  } catch (err) {
    console.error('PDF JS extraction error:', err)
    return ''
  }
}

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
        message: 'Could not extract text from this PDF. If it is a scanned image, try uploading a JPG/PNG screenshot of the report instead, or use Manual Entry.',
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
