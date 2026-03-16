import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client for storage operations only
const storageClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { base64, fileName, mimeType, fileSize, userId, category, notes, accessToken } = await req.json()

    if (!base64 || !fileName || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Build an authenticated client so RLS sees the correct user
    const authClient = accessToken
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        )
      : storageClient

    // Upload to Supabase Storage
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${userId}/${Date.now()}-${safeName}`

    const buffer = Buffer.from(base64, 'base64')
    const { error: uploadError } = await storageClient.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    // Insert document record using auth'd client so RLS passes
    const { data, error: dbError } = await authClient
      .from('documents')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_type: mimeType,
        file_size_bytes: fileSize,
        storage_path: storagePath,
        category: category || 'other',
        notes: notes || null,
      })
      .select()
      .single()

    if (dbError) {
      // Clean up storage if DB insert fails
      await storageClient.storage.from('documents').remove([storagePath])
      console.error('Document DB insert error:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ document: data })

  } catch (err: any) {
    console.error('Documents API error:', err)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { documentId, storagePath, userId, accessToken } = await req.json()

    if (!documentId || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const authClient = accessToken
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        )
      : storageClient

    // Delete from storage
    if (storagePath) {
      await storageClient.storage.from('documents').remove([storagePath])
    }

    // Delete from DB
    const { error } = await authClient
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 })
  }
}
