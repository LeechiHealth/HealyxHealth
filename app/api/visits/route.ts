import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { transcript, userId, title, accessToken } = await request.json()

    if (!transcript?.trim() || !userId) {
      return NextResponse.json({ error: 'Transcript and userId required' }, { status: 400 })
    }

    // Use authenticated client so RLS passes
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {}
    )

    const noteTitle = title?.trim() || `Visit note — ${new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`

    const { data, error } = await supabase
      .from('visit_notes')
      .insert({
        user_id: userId,
        title: noteTitle,
        transcript: transcript.trim(),
      })
      .select('id, title, created_at')
      .single()

    if (error) {
      console.error('Visit note save error:', error)
      return NextResponse.json({ error: 'Failed to save visit note' }, { status: 500 })
    }

    return NextResponse.json({ success: true, note: data })
  } catch (error) {
    console.error('Visit API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
