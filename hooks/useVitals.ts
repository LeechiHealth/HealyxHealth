import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

export function useVitals() {
  const [vitals, setVitals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchVitals = async () => {
      try {
        // Create client inline
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        )

        // Get current logged in user
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          setError('No user logged in')
          setLoading(false)
          return
        }

        // Fetch their vitals from database
        const { data, error: fetchError } = await supabase
          .from('vitals')
          .select('*')
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: false })

        if (fetchError) {
          setError(fetchError.message)
        } else {
          setVitals(data || [])
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchVitals()
  }, [])

  return { vitals, loading, error }
}