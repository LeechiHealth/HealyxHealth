import { NextRequest, NextResponse } from 'next/server'
import { groq, GROQ_MODEL } from '@/lib/groq/client'
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

async function extractPdfText(base64: string): Promise<string> {
  const tmpIn = join(tmpdir(), `healyx-pdf-${Date.now()}.pdf`)
  const tmpOut = join(tmpdir(), `healyx-pdf-${Date.now()}.txt`)
  try {
    writeFileSync(tmpIn, Buffer.from(base64, 'base64'))
    // pdftotext (poppler-utils) — reliable Node.js-safe PDF extraction
    execSync(`pdftotext -layout -l 10 "${tmpIn}" "${tmpOut}"`, { timeout: 15000 })
    const { readFileSync } = await import('fs')
    const text = readFileSync(tmpOut, 'utf-8').trim()
    return text.substring(0, 6000)
  } catch (err) {
    console.error('PDF extraction error:', err)
    return ''
  } finally {
    if (existsSync(tmpIn)) unlinkSync(tmpIn)
    if (existsSync(tmpOut)) unlinkSync(tmpOut)
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
        message: 'Could not extract text from this PDF. It may be a scanned image — please use Manual Entry to add your results.',
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
