"use client"

import { useState, useEffect } from "react"
import { CheckCircle, XCircle, RefreshCw, Loader2, ExternalLink, Info } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { cn } from "@/lib/utils"

interface ConnectedService {
  id: string
  service_name: string
  status: string
  last_sync_at: string | null
  sync_frequency: string
  enabled_data_types: string[]
}

interface ServiceDefinition {
  id: string
  name: string
  description: string
  dataTypes: string[]
  color: string
  docsUrl: string
  availability: 'available' | 'coming_soon'
  oauthUrl?: string
  logo: React.ReactNode
}

// Service logos as SVG paths (inline, no external deps)
function GoogleFitLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#34A853" opacity="0.2"/>
      <path d="M7 12l3 3 7-7" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function FitbitLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#00B0B9" opacity="0.2"/>
      <circle cx="12" cy="12" r="3" fill="#00B0B9"/>
      <circle cx="12" cy="5" r="2" fill="#00B0B9"/>
      <circle cx="12" cy="19" r="2" fill="#00B0B9"/>
      <circle cx="5" cy="12" r="2" fill="#00B0B9"/>
      <circle cx="19" cy="12" r="2" fill="#00B0B9"/>
    </svg>
  )
}
function AppleHealthLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path d="M12 21.5C7 21.5 3 17 3 12S7 2.5 12 2.5 21 7 21 12s-4 9.5-9 9.5z" fill="#FF2D55" opacity="0.2"/>
      <path d="M12 8v4l2.5 2.5" stroke="#FF2D55" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 6.5c0-1.5 2-2.5 3-1 1-1.5 3-.5 3 1" stroke="#FF2D55" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
function MyChartLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#0033A0" opacity="0.15"/>
      <path d="M7 12h2l2-4 2 8 2-4h2" stroke="#0033A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function WithingsLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#6366F1" opacity="0.15"/>
      <path d="M8 12.5l2 2 4-5" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function OuraLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#F59E0B" opacity="0.15"/>
      <circle cx="12" cy="12" r="5" stroke="#F59E0B" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="12" r="2" fill="#F59E0B"/>
    </svg>
  )
}

const SERVICES: ServiceDefinition[] = [
  {
    id: 'google_fit',
    name: 'Google Fit',
    description: 'Sync steps, heart rate, sleep, workouts, and weight from your Android or Wear OS device.',
    dataTypes: ['Steps', 'Heart Rate', 'Sleep', 'Weight', 'Workouts'],
    color: '#34A853',
    docsUrl: 'https://developers.google.com/fit',
    availability: 'coming_soon',
    logo: <GoogleFitLogo />,
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    description: 'Connect your Fitbit to sync daily activity, heart rate, sleep stages, and nutrition data.',
    dataTypes: ['Activity', 'Heart Rate', 'Sleep', 'Nutrition', 'Weight'],
    color: '#00B0B9',
    docsUrl: 'https://dev.fitbit.com',
    availability: 'coming_soon',
    logo: <FitbitLogo />,
  },
  {
    id: 'apple_health',
    name: 'Apple Health',
    description: 'Import your Apple Health data including vitals, workouts, sleep, and medical records.',
    dataTypes: ['Vitals', 'Workouts', 'Sleep', 'ECG', 'Medications'],
    color: '#FF2D55',
    docsUrl: 'https://developer.apple.com/documentation/healthkit',
    availability: 'coming_soon',
    logo: <AppleHealthLogo />,
  },
  {
    id: 'mychart',
    name: 'MyChart / Epic FHIR',
    description: 'Connect your hospital or clinic portal to sync lab results, diagnoses, medications, and visit notes automatically.',
    dataTypes: ['Lab Results', 'Diagnoses', 'Medications', 'Visit Notes', 'Allergies'],
    color: '#0033A0',
    docsUrl: 'https://fhir.epic.com',
    availability: 'coming_soon',
    logo: <MyChartLogo />,
  },
  {
    id: 'withings',
    name: 'Withings',
    description: 'Sync data from Withings smart scales, blood pressure monitors, and sleep trackers.',
    dataTypes: ['Weight', 'Blood Pressure', 'Sleep', 'Body Composition'],
    color: '#6366F1',
    docsUrl: 'https://developer.withings.com',
    availability: 'coming_soon',
    logo: <WithingsLogo />,
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Sync readiness, sleep quality, HRV, and activity scores from your Oura Ring.',
    dataTypes: ['Sleep', 'HRV', 'Readiness', 'Activity', 'Temperature'],
    color: '#F59E0B',
    docsUrl: 'https://cloud.ouraring.com/docs',
    availability: 'coming_soon',
    logo: <OuraLogo />,
  },
]

export function ConnectedServicesTab() {
  const { user } = useAuth()
  const [connected, setConnected] = useState<ConnectedService[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchConnected()
  }, [user])

  async function fetchConnected() {
    if (!user) return
    const { data } = await supabase
      .from('connected_services')
      .select('*')
      .eq('user_id', user.id)
    setConnected(data || [])
    setLoading(false)
  }

  function getConnectionState(serviceId: string) {
    return connected.find(c => c.service_name === serviceId)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Connected Services</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Connect your wearables, smart devices, and EHR portals to automatically sync health data into HEALYX.
              Each integration uses OAuth 2.0 — HEALYX never stores your credentials.
            </p>
          </div>
        </div>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
        <Info className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Integrations are in <span className="text-cyan-400 font-medium">active development</span>. Click <strong className="text-foreground/70">Learn More</strong> on any service to review its API documentation and vote for which to prioritize.
        </p>
      </div>

      {/* Service grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => {
          const conn = getConnectionState(service.id)
          const isConnected = conn?.status === 'connected'

          return (
            <div
              key={service.id}
              className="glass rounded-2xl p-5 border border-white/10 flex flex-col gap-4 hover:border-cyan-500/20 transition-colors"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                    {service.logo}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{service.name}</p>
                    {isConnected ? (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Connected
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Not connected</p>
                    )}
                  </div>
                </div>
                {service.availability === 'coming_soon' && !isConnected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
                    Soon
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">{service.description}</p>

              {/* Data types */}
              <div className="flex flex-wrap gap-1">
                {service.dataTypes.map(dt => (
                  <span key={dt} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                    {dt}
                  </span>
                ))}
              </div>

              {/* Last sync (if connected) */}
              {isConnected && conn?.last_sync_at && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <RefreshCw className="h-3 w-3" />
                  Last synced {new Date(conn.last_sync_at).toLocaleDateString()}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-auto pt-1">
                <a
                  href={service.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Learn More
                </a>
                <div className="flex-1" />
                {isConnected ? (
                  <button
                    disabled
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 opacity-50 cursor-not-allowed"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    disabled
                    title="Coming soon — tap Learn More to view docs"
                    className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 opacity-50 cursor-not-allowed"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Have a device or platform you want to connect?{' '}
        <span className="text-cyan-400">Let us know</span> and we&apos;ll prioritize it.
      </p>
    </div>
  )
}
