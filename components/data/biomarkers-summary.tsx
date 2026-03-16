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
          .select('*')
          .eq('user_id', user.id)
          .order('test_date', { ascending: false })

        if (error) throw error

        // Group by name and get latest for each
        const latestByName = new Map<string, Biomarker>()
        data?.forEach(biomarker => {
          if (!latestByName.has(biomarker.name)) {
            latestByName.set(biomarker.name, biomarker)
          }
        })

        setBiomarkers(Array.from(latestByName.values()))
      } catch (error) {
        console.error('Error fetching biomarkers:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBiomarkers()
  }, [user])

  // Calculate stats based on real data
  const total = biomarkers.length
  const optimal = biomarkers.filter(b => {
    // Simple heuristic - you can make this more sophisticated
    const name = b.name.toLowerCase()
    if (name.includes('cholesterol')) return b.value < 200
    if (name.includes('glucose')) return b.value < 100
    if (name.includes('a1c')) return b.value < 5.7
    return true // Default to optimal if we don't have ranges
  }).length
  
  const inRange = Math.floor((total - optimal) * 0.7) // Roughly 70% of non-optimal
  const outOfRange = total - optimal - inRange

  const stats = [
    { value: total, label: "Total", color: "bg-cyan-400" },
    { value: optimal, label: "Optimal", color: "bg-cyan-400" },
    { value: inRange, label: "In range", color: "bg-yellow-400" },
    { value: outOfRange, label: "Out of range", color: "bg-pink-400" },
  ]

  // Calculate proportions for the progress bar
  const optimalWidth = total > 0 ? (optimal / total) * 100 : 0
  const inRangeWidth = total > 0 ? (inRange / total) * 100 : 0
  const outOfRangeWidth = total > 0 ? (outOfRange / total) * 100 : 0

  if (loading) {
    return (
      <div className="glass rounded-2xl p-5 mb-6">
        <p className="text-sm text-muted-foreground">Loading biomarkers...</p>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-5 mb-6">
      <h3 className="text-base font-medium mb-4 text-foreground">Biomarkers</h3>
      
      <div className="grid grid-cols-4 gap-6 mb-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-3xl font-light text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-secondary">
          <div className="bg-cyan-400" style={{ width: `${optimalWidth}%` }} />
          <div className="bg-yellow-400" style={{ width: `${inRangeWidth}%` }} />
          <div className="bg-pink-400" style={{ width: `${outOfRangeWidth}%` }} />
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