import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Always get the authenticated user from the JWT — never trust userId from the body
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { transcript, title } = body

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    if (transcript.trim().length > 50000) {
      return NextResponse.json({ error: 'Transcript too long' }, { status: 400 })
    }

    const noteTitle = title?.trim()?.substring(0, 200) || `Visit note — ${new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`

    const { data, error } = await supabase
      .from('visit_notes')
      .insert({
        user_id: user.id,
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
