"use client"

import { useState } from 'react'
import { useBiomarkers } from '@/hooks/useBiomarkers'
import { buildHealthBrief } from '@/lib/healthBrief'
import { BiomarkerDetailModal } from './biomarker-detail-modal'

export function BiomarkersList({ categoryFilter = 'All data' }: { categoryFilter?: string }) {
  const { biomarkers, loading, error, refresh } = useBiomarkers()
  const [selected, setSelected] = useState<string | null>(null)
  const brief = buildHealthBrief(biomarkers)
  const rows = categoryFilter === 'All data' ? brief.latest : brief.latest.filter(row => getCategoryForBiomarker(row.name) === categoryFilter)
  if (loading) return <div className="health-panel p-6 text-muted-foreground">Loading lab records…</div>
  if (error) return <div className="health-panel p-6"><p role="alert">{error}</p><button onClick={refresh} className="text-primary mt-2 font-semibold">Try again</button></div>
  return <>
    <div className="health-panel overflow-hidden divide-y divide-border">
      {rows.length === 0 && <p className="p-6 text-muted-foreground">{brief.latest.length ? `No results in ${categoryFilter}.` : 'No lab results yet. Add your first result to start your record.'}</p>}
      {rows.map(row => <button key={row.id} onClick={() => setSelected(row.name)} className="w-full text-left grid sm:grid-cols-[minmax(0,1fr)_130px_150px] items-center gap-3 p-5 hover:bg-secondary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors">
        <div><p className="font-semibold">{row.name}</p><p className="text-xs text-muted-foreground mt-1">{row.dateLabel}</p>{row.change && <p className="text-xs text-muted-foreground mt-2">{row.change} · direction alone does not indicate improvement</p>}</div>
        <span className={`text-xs font-semibold ${row.classification === 'flagged' ? 'text-amber-600 dark:text-amber-300' : row.classification === 'in-range' ? 'text-primary' : 'text-muted-foreground'}`}>{row.classification === 'flagged' ? `Recorded: ${row.status}` : row.classification === 'in-range' ? 'Recorded in range' : 'Unclassified'}</span>
        <div className="sm:text-right"><p className="text-lg font-semibold tabular-nums">{row.value ?? '—'} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span></p>{row.reference_range_text && <p className="text-xs text-muted-foreground mt-1">Lab range: {row.reference_range_text}</p>}</div>
      </button>)}
    </div>
    {selected && <BiomarkerDetailModal biomarkerName={selected} open onClose={() => setSelected(null)} onUpdate={refresh} />}
  </>
}
function getCategoryForBiomarker(name: string): string {
  if (/cholesterol|apob|apolipoprotein/i.test(name)) return 'Heart health'
  if (/vitamin|b12|iron/i.test(name)) return 'Nutrients'
  if (/tsh|thyroid/i.test(name)) return 'Thyroid Health'
  if (/glucose|a1c|hemoglobin/i.test(name)) return 'Metabolic Health'
  if (/ferritin/i.test(name)) return 'Blood'
  return 'General'
}
