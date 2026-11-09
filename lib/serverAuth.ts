import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type Authentication =
  | { user: User; supabase: SupabaseClient; response?: never }
  | { response: NextResponse; user?: never; supabase?: never }

// Browser sessions live in localStorage. Verify the bearer token explicitly;
// never use a service-role key, so row-level security also protects every query.
export async function authenticateRequest(request: Request): Promise<Authentication> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return { response: NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return { response: NextResponse.json({ error: 'Sign-in services are not configured. Please contact the site administrator.' }, { status: 503 }) }
  }
  try {
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error && (error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) {
      return { response: NextResponse.json({ error: 'Sign-in services could not be reached. Please try again.' }, { status: 503 }) }
    }
    if (error || !user) {
      return { response: NextResponse.json({ error: 'Your session has expired. Sign in again to continue.' }, { status: 401 }) }
    }
    return { user, supabase }
  } catch {
    return { response: NextResponse.json({ error: 'Sign-in services could not be reached. Please try again.' }, { status: 503 }) }
  }
}
