"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { BiomarkerDetailModal } from "./biomarker-detail-modal"

type BiomarkerStatus = "optimal" | "normal" | "out-of-range"

interface Biomarker {
  id: string
  name: string
  category: string
  status: BiomarkerStatus
  value: number
  unit: string
  test_date: string
  trend?: number[]
}

interface BiomarkersListProps {
  categoryFilter?: string
}

const statusConfig: Record<BiomarkerStatus, { label: string; dotColor: string; textColor: string }> = {
  optimal: {
    label: "Optimal",
    dotColor: "bg-cyan-400",
    textColor: "text-cyan-400",
  },
  normal: {
    label: "Normal",
    dotColor: "bg-yellow-400",
    textColor: "text-yellow-400",
  },
  "out-of-range": {
    label: "Out of Range",
    dotColor: "bg-pink-400",
    textColor: "text-pink-400",
  },
}

function TrendChart({ data, status }: { data: number[]; status: BiomarkerStatus }) {
  if (!data || data.length === 0) return null

  const min = Math.min(...data) * 0.9
  const max = Math.max(...data) * 1.1
  const range = max - min

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return { x, y }
  })

  const pathD = points
    .map((point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`))
    .join(" ")

  const lineColor = status === "out-of-range" 
    ? "#f472b6" 
    : status === "optimal" 
    ? "#22d3ee" 
    : "#facc15"

  return (
    <div className="relative w-24 h-10">
      <div className="absolute right-0 top-0 bottom-0 w-px bg-pink-500/30" />
      
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${lineColor})` }}
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={lineColor}
            style={{ filter: `drop-shadow(0 0 4px ${lineColor})` }}
          />
        ))}
      </svg>
    </div>
  )
}

export function BiomarkersList({ categoryFilter = "All data" }: BiomarkersListProps) {
  const { user } = useAuth()
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBiomarker, setSelectedBiomarker] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function fetchBiomarkers() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('biomarkers')
        .select('*')
        .eq('user_id', user.id)
        .order('test_date', { ascending: false })

      if (error) throw error

      const grouped = data.reduce((acc: Record<string, any[]>, item) => {
        if (!acc[item.name]) acc[item.name] = []
        acc[item.name].push(item)
        return acc
      }, {})

      const processed = Object.entries(grouped).map(([name, records]) => {
        const latest = records[0]
        const trend = records.slice(0, 5).reverse().map(r => r.value)
        
        let status: BiomarkerStatus = "normal"
        if (name.includes("Cholesterol") && latest.value > 100) status = "out-of-range"
        else if (trend.length > 1 && trend[trend.length - 1] < trend[0]) status = "optimal"

        return {
          id: latest.id,
          name: latest.name,
          category: getCategoryForBiomarker(latest.name),
          status,
          value: latest.value,
          unit: latest.unit,
          test_date: latest.test_date,
          trend: trend.length > 1 ? trend : undefined,
        }
      })

      setBiomarkers(processed)
    } catch (error) {
      console.error('Error fetching biomarkers:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBiomarkers()
  }, [user])

  if (loading) {
    return <div className="glass rounded-2xl p-6 text-center text-muted-foreground">Loading biomarkers...</div>
  }

  if (biomarkers.length === 0) {
    return <div className="glass rounded-2xl p-6 text-center text-muted-foreground">No biomarkers yet. Add your first lab result!</div>
  }

  // Filter biomarkers by category
  const filteredBiomarkers = categoryFilter === "All data" 
    ? biomarkers 
    : biomarkers.filter(b => b.category === categoryFilter)

  return (
    <>
      <div className="glass rounded-2xl divide-y divide-border">
        {filteredBiomarkers.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No biomarkers in {categoryFilter}
          </div>
        ) : (
          filteredBiomarkers.map((biomarker) => {
            const config = statusConfig[biomarker.status]
            return (
              <div
                key={biomarker.id}
                onClick={() => {
                  setSelectedBiomarker(biomarker.name)
                  setModalOpen(true)
                }}
                className="flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <p className="font-medium text-foreground">{biomarker.name}</p>
                  <p className="text-sm text-muted-foreground">{biomarker.category}</p>
                </div>

                <div className="flex items-center gap-2 w-32">
                  <span className={`h-2 w-2 rounded-full ${config.dotColor}`} style={{ boxShadow: `0 0 8px currentColor` }} />
                  <span className={`text-sm font-medium ${config.textColor}`}>
                    {config.label}
                  </span>
                </div>

                <div className="w-24 text-right">
                  <span className="font-medium text-foreground">{biomarker.value}</span>
                  <span className="text-sm text-muted-foreground ml-1">{biomarker.unit}</span>
                </div>

                <div className="w-28 flex justify-end">
                  {biomarker.trend && <TrendChart data={biomarker.trend} status={biomarker.status} />}
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedBiomarker && (
        <BiomarkerDetailModal
          biomarkerName={selectedBiomarker}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onUpdate={fetchBiomarkers}
        />
      )}
    </>
  )
}

function getCategoryForBiomarker(name: string): string {
  if (name.includes("Cholesterol") || name.includes("ApoB") || name.includes("Apolipoprotein")) return "Heart health"
  if (name.includes("Vitamin") || name.includes("B12") || name.includes("Iron")) return "Nutrients"
  if (name.includes("TSH") || name.includes("Thyroid")) return "Thyroid Health"
  if (name.includes("Glucose") || name.includes("A1C") || name.includes("Hemoglobin")) return "Metabolic Health"
  if (name.includes("Ferritin")) return "Blood"
  return "General"
}