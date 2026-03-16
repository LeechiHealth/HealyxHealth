import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

export function useConditions() {
  const [conditions, setConditions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchConditions = async () => {
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

        // Fetch their conditions from database
        const { data, error: fetchError } = await supabase
          .from('conditions')
          .select('*')
          .eq('user_id', user.id)
          .order('diagnosed_date', { ascending: false })

        if (fetchError) {
          setError(fetchError.message)
        } else {
          setConditions(data || [])
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchConditions()
  }, [])

  return { conditions, loading, error }
}