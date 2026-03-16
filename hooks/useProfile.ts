import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/components/AuthContext'

interface Profile {
  id: string
  email: string | null
  full_name: string | null
  date_of_birth: string | null
  gender: string | null
  height_cm: number | null
}

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const fetchProfile = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, email, full_name, date_of_birth, gender, height_cm')
          .eq('id', user.id)
          .single()

        if (fetchError) {
          setError(fetchError.message)
        } else {
          setProfile(data)
        }
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [user])

  return { profile, loading, error }
}
