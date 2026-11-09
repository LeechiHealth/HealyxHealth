"use client"

import { useBiomarkers } from '@/hooks/useBiomarkers'
import { buildHealthBrief } from '@/lib/healthBrief'

export function BiomarkersSummary() {
  const { biomarkers, loading, error, refresh } = useBiomarkers()
  const brief = buildHealthBrief(biomarkers)
  if (loading) return <div className="health-panel p-5 mb-6 text-sm text-muted-foreground">Loading lab records…</div>
  if (error) return <div className="health-panel p-5 mb-6"><p role="alert">{error}</p><button onClick={refresh} className="text-primary font-semibold mt-2">Try again</button></div>
  return <div className="health-panel p-5 mb-6">
    <h3 className="font-semibold mb-4">Latest recorded lab results</h3>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
      {[['Markers', brief.latest.length], ['Recorded in range', brief.inRange], ['Recorded flags', brief.flagged], ['Unclassified', brief.unknown]].map(([label, value]) => <div key={label}><p className="text-3xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground mt-1">{label}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground mt-4">Statuses come from saved records. Missing flags, conflicting results, and unverified dates stay unclassified; they do not mean normal.</p>
    {brief.undatedCount > 0 && <p className="text-xs text-muted-foreground mt-2">{brief.undatedCount} record{brief.undatedCount === 1 ? '' : 's'} need a valid measurement date.</p>}
  </div>
}
