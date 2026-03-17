"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { AddVitalDialog } from "./add-vital-dialog"

interface Vital {
  id: string
  weight_kg?: number
  systolic_bp?: number
  diastolic_bp?: number
  heart_rate?: number
  temperature_celsius?: number
  oxygen_saturation?: number
  recorded_at: string
}

export function VitalsDashboard() {
  const { user } = useAuth()
  const [vitals, setVitals] = useState<Vital[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchVitals() {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('vitals')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false })

      if (error) throw error
      setVitals(data || [])
    } catch (error) {
      console.error('Error fetching vitals:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVitals()
  }, [user])

  const getLatestForType = (field: keyof Vital) => {
    return vitals.find(v => v[field] != null)?.[field]
  }
  
  const latestBP = vitals.find(v => v.systolic_bp && v.diastolic_bp)
  const latestHR = getLatestForType('heart_rate')
  const latestWeight = getLatestForType('weight_kg')
  const latestTemp = getLatestForType('temperature_celsius')
  const latestSpO2 = getLatestForType('oxygen_saturation')

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading vitals...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Vitals</h2>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            Last updated: {vitals[0] ? new Date(vitals[0].recorded_at).toLocaleDateString() : 'Never'}
          </span>
          <AddVitalDialog onSuccess={fetchVitals} />
        </div>
      </div>

      <div className="glass rounded-2xl border border-cyan-500/20 p-6">
        <div className="flex gap-6">
          <div className="w-48 flex-shrink-0">
            <div className="glass rounded-xl p-3 border border-cyan-500/20">
              <span className="text-[10px] font-mono text-cyan-400 block mb-3">
                PATIENT INFO
              </span>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Weight</span>
                  <span className="text-xs text-foreground">
                    {latestWeight ? `${latestWeight} kg` : 'No data'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">RHR</span>
                  <span className="text-xs text-emerald-400">
                    {latestHR ? `${latestHR} bpm` : 'No data'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Latest Vitals</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-6">
                <div className="glass rounded-xl px-3 py-2 border border-cyan-500/10">
                  <div className="text-[11px] text-muted-foreground">Blood Pressure</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {latestBP ? `${latestBP.systolic_bp}/${latestBP.diastolic_bp}` : '--/--'}
                  </div>
                </div>
                <div className="glass rounded-xl px-3 py-2 border border-cyan-500/10">
                  <div className="text-[11px] text-muted-foreground">Heart Rate</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-400">
                    {latestHR || '--'}
                    <span className="text-xs text-muted-foreground"> bpm</span>
                  </div>
                </div>
                <div className="glass rounded-xl px-3 py-2 border border-cyan-500/10">
                  <div className="text-[11px] text-muted-foreground">SpO2</div>
                  <div className="mt-1 text-lg font-semibold text-emerald-400">
                    {latestSpO2 || '--'}
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="glass rounded-xl px-3 py-2 border border-cyan-500/10">
                  <div className="text-[11px] text-muted-foreground">Temperature</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {latestTemp || '--'}
                    <span className="text-xs text-muted-foreground">°C</span>
                  </div>
                </div>
                <div className="glass rounded-xl px-3 py-2 border border-cyan-500/10">
                  <div className="text-[11px] text-muted-foreground">Weight</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {latestWeight || '--'}
                    <span className="text-xs text-muted-foreground"> kg</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Recent Recordings</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {vitals.slice(0, 10).map((vital) => (
                  <div key={vital.id} className="glass rounded-xl px-4 py-3 border border-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-base font-medium text-foreground">
                          {vital.systolic_bp ? 'Blood Pressure' : 
                           vital.heart_rate ? 'Heart Rate' :
                           vital.weight_kg ? 'Weight' :
                           vital.temperature_celsius ? 'Temperature' :
                           vital.oxygen_saturation ? 'SpO2' : 'Vital'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(vital.recorded_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-xl font-semibold text-foreground">
                        {vital.systolic_bp ? `${vital.systolic_bp}/${vital.diastolic_bp}` :
                         vital.heart_rate ? `${vital.heart_rate} bpm` :
                         vital.weight_kg ? `${vital.weight_kg} kg` :
                         vital.temperature_celsius ? `${vital.temperature_celsius}°C` :
                         vital.oxygen_saturation ? `${vital.oxygen_saturation}%` : '--'}
                      </p>
                    </div>
                  </div>
                ))}
                {vitals.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No vitals recorded yet. Click "Add Vital" to get started!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}