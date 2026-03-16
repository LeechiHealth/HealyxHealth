import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useClinicalReferences() {
  const [references, setReferences] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReferences = async () => {
      try {
        // Get current logged in user
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          setError('No user logged in')
          setLoading(false)
          return
        }

        // Fetch their clinical references from database
        const { data, error: fetchError } = await supabase
          .from('clinical_references')
          .select('*')
          .eq('user_id', user.id)
          .order('saved_at', { ascending: false })

        if (fetchError) {
          setError(fetchError.message)
        } else {
          setReferences(data || [])
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchReferences()
  }, [])

  return { references, loading, error }
}