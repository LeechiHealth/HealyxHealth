"use client"

import * as React from "react"
import { FlaskConical, Activity, Upload, Mic } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"

interface TimelineProps {
  showViewAllLink?: boolean
  limit?: number
}

interface ActivityItem {
  id: string
  type: "lab" | "vital" | "document" | "visit_note"
  title: string
  subtitle: string
  date: string
  displayDate: string
}

const TYPE_CONFIG = {
  lab:        { icon: FlaskConical, color: "text-cyan-400",   bg: "bg-cyan-500/10 border-cyan-500/20" },
  vital:      { icon: Activity,     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  document:   { icon: Upload,       color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  visit_note: { icon: Mic,          color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}
function formatVitalType(t: string) {
  return ({ weight: 'Weight', blood_pressure: 'Blood pressure', heart_rate: 'Heart rate',
    temperature: 'Temperature', oxygen_saturation: 'O₂ saturation', glucose: 'Glucose', bmi: 'BMI' } as any)[t]
    || t.replace(/_/g, ' ')
}
function formatCategory(c: string) {
  return ({ lab_result: 'Lab result', imaging: 'Imaging', prescription: 'Prescription',
    visit_note: 'Visit note', insurance: 'Insurance', other: 'Other' } as any)[c] || c
}

export function Timeline({ showViewAllLink = true, limit = 8 }: TimelineProps) {
  const { user } = useAuth()
  const [items, setItems] = React.useState<ActivityItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => { if (user) loadActivity() }, [user])

  async function loadActivity() {
    if (!user) return
    setLoading(true)
    try {
      const [labsRes, vitalsRes, docsRes, notesRes] = await Promise.all([
        supabase.from('biomarkers').select('id,name,value,unit,status,test_date,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('vitals').select('id,type,value,unit,recorded_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('documents').select('id,file_name,category,uploaded_at').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(20),
        supabase.from('visit_notes').select('id,title,transcript,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      ])

      const all: ActivityItem[] = [
        ...(labsRes.data || []).map((b: any): ActivityItem => ({
          id: `lab-${b.id}`, type: 'lab',
          title: `${b.name} result logged`,
          subtitle: `${b.value} ${b.unit}${b.status ? ` · ${b.status}` : ''}`,
          date: b.created_at, displayDate: formatDate(b.test_date || b.created_at),
        })),
        ...(vitalsRes.data || []).map((v: any): ActivityItem => ({
          id: `vital-${v.id}`, type: 'vital',
          title: `${formatVitalType(v.type)} recorded`,
          subtitle: `${v.value} ${v.unit || ''}`.trim(),
          date: v.created_at, displayDate: formatDate(v.recorded_at || v.created_at),
        })),
        ...(docsRes.data || []).map((d: any): ActivityItem => ({
          id: `doc-${d.id}`, type: 'document',
          title: 'Document uploaded',
          subtitle: `${d.file_name}${d.category ? ` · ${formatCategory(d.category)}` : ''}`,
          date: d.uploaded_at, displayDate: formatDate(d.uploaded_at),
        })),
        ...(notesRes.data || []).map((n: any): ActivityItem => ({
          id: `note-${n.id}`, type: 'visit_note',
          title: n.title || 'Visit note recorded',
          subtitle: n.transcript ? n.transcript.substring(0, 80) + (n.transcript.length > 80 ? '…' : '') : 'Voice recording saved',
          date: n.created_at, displayDate: formatDate(n.created_at),
        })),
      ]

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setItems(all.slice(0, limit))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 rounded-3xl glass-darker overflow-hidden">
      <div className="flex items-center px-6 py-5 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
        {!loading && items.length > 0 && (
          <span className="ml-2 text-xs text-muted-foreground/50">{items.length} events</span>
        )}
      </div>
      <div className="px-6 py-4">
        {loading ? (
          <div className="space-y-3 py-2">
            {[0,1,2].map(i => (
              <div key={i} className="flex items-start gap-4 py-3 animate-pulse">
                <div className="h-10 w-10 rounded-lg bg-white/5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-white/8 rounded-full w-2/3" />
                  <div className="h-3 bg-white/5 rounded-full w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Add lab results, vitals, documents, or record a visit note</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map(item => {
              const cfg = TYPE_CONFIG[item.type]
              const Icon = cfg.icon
              return (
                <div key={item.id} className="flex items-start gap-4 py-3 border-b border-border/50 last:border-0">
                  <div className={`flex items-center justify-center h-10 w-10 rounded-lg border shrink-0 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</p>
                  </div>
                  <span className="text-xs text-muted-foreground/60 shrink-0 pt-0.5">{item.displayDate}</span>
                </div>
              )
            })}
          </div>
        )}
        {showViewAllLink && (
          <div className="mt-4 text-center py-2">
            <Link href="/data?tab=activity" className="text-xs text-muted-foreground hover:text-cyan-400 transition-colors">
              View all activity →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
