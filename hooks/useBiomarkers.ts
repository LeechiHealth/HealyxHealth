import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/components/AuthContext'

export function useBiomarkers() {
  const { user } = useAuth()
  const [biomarkers, setBiomarkers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const fetchBiomarkers = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('biomarkers')
          .select('*')
          .eq('user_id', user.id)
          .order('test_date', { ascending: false })

        if (fetchError) {
          setError(fetchError.message)
        } else {
          setBiomarkers(data || [])
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchBiomarkers()
  }, [user])

  return { biomarkers, loading, error }
}