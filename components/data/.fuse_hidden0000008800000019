"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"

interface Biomarker {
  id: string
  name: string
  value: number
  unit: string
  test_date: string
  status: string | null
  reference_range_text: string | null
}

export function BiomarkersSummary() {
  const { user } = useAuth()
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBiomarkers() {
      if (!user) return
      try {
        const { data, error } = await supabase
          .from('biomarkers')
          .select('id, name, value, unit, test_date, status, reference_range_text')
          .eq('user_id', user.id)
          .order('test_date', { ascending: false })
        if (error) throw error

        // Keep only the latest value per biomarker name
        const latestByName = new Map<string, Biomarker>()
        data?.forEach(b => {
          if (!latestByName.has(b.name)) latestByName.set(b.name, b)
        })
        setBiomarkers(Array.from(latestByName.values()))
      } catch (err) {
        console.error('Biomarkers fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchBiomarkers()
  }, [user])

  // Use the actual `status` field from the database — no guessing
  const total = biomarkers.length
  const optimal = biomarkers.filter(b => b.status === 'optimal').length
  const normal = biomarkers.filter(b => b.status === 'normal' || (!b.status && b.reference_range_text)).length
  const outOfRange = biomarkers.filter(b =>
    b.status === 'high' || b.status === 'low' || b.status === 'borderline' || b.status === 'critical'
  ).length
  const unclassified = total - optimal - normal - outOfRange

  const stats = [
    { value: total, label: "Total", color: "bg-cyan-400" },
    { value: optimal, label: "Optimal", color: "bg-cyan-400" },
    { value: normal + unclassified, label: "In range", color: "bg-yellow-400" },
    { value: outOfRange, label: "Out of range", color: "bg-pink-400" },
  ]

  const optimalWidth = total > 0 ? (optimal / total) * 100 : 0
  const inRangeWidth = total > 0 ? ((normal + unclassified) / total) * 100 : 0
  const outWidth = total > 0 ? (outOfRange / total) * 100 : 0

  if (loading) {
    return (
      <div className="glass rounded-2xl p-5 mb-6">
        <p className="text-sm text-muted-foreground">Loading biomarkers…</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-5 mb-6">
      <h3 className="text-base font-medium mb-4 text-foreground">Biomarkers</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-3xl font-light text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
          <div className="bg-cyan-400 transition-all" style={{ width: `${optimalWidth}%` }} />
          <div className="bg-yellow-400 transition-all" style={{ width: `${inRangeWidth}%` }} />
          <div className="bg-pink-400 transition-all" style={{ width: `${outWidth}%` }} />
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No biomarkers recorded yet
        </p>
      )}
    </div>
  )
}
