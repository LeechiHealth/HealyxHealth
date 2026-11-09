import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/components/AuthContext'
import type { HealthRecord } from '@/lib/healthBrief'

export function useBiomarkers() {
  const { user } = useAuth()
  const [state, setState] = useState<{ owner: string | null; biomarkers: HealthRecord[]; loading: boolean; error: string | null }>({ owner: null, biomarkers: [], loading: true, error: null })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => window.dispatchEvent(new Event('healyx:records-updated')), [])
  useEffect(() => {
    const update = () => setRevision(value => value + 1)
    window.addEventListener('healyx:records-updated', update)
    return () => window.removeEventListener('healyx:records-updated', update)
  }, [])
  useEffect(() => {
    let active = true
    const owner = user?.id ?? null
    setState({ owner, biomarkers: [], loading: !!owner, error: null })
    if (!owner) return () => { active = false }
    ;(async () => {
      try {
        const { data, error } = await supabase.from('biomarkers').select('*').eq('user_id', owner).order('test_date', { ascending: false })
        if (error) throw error
        if (active) setState({ owner, biomarkers: data || [], loading: false, error: null })
      } catch {
        if (active) setState({ owner, biomarkers: [], loading: false, error: 'Your lab records could not be loaded. Please try again.' })
      }
    })()
    return () => { active = false }
  }, [user?.id, revision])
  const matches = state.owner === (user?.id ?? null)
  return { biomarkers: matches ? state.biomarkers : [], loading: matches ? state.loading : !!user, error: matches ? state.error : null, refresh }
}
