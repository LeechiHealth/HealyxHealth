"use client"

import { useState, useRef } from "react"
import { Upload, CheckCircle, X, Loader2, FileText, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------
type ServiceId = 'fitbit' | 'apple_health' | 'oura' | 'withings' | 'google_fit' | 'mychart'
type Availability = 'available' | 'coming_soon'

interface ServiceDef {
  id: ServiceId
  name: string
  tagline: string
  dataTypes: string[]
  color: string
  availability: Availability
  acceptedFiles: string
  acceptMime: string
  instructions: string[]
  logo: React.ReactNode
}

// Inline SVG logos
function FitbitLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#00B0B9" opacity="0.2" />
      <circle cx="12" cy="12" r="3" fill="#00B0B9" />
      <circle cx="12" cy="5" r="2" fill="#00B0B9" />
      <circle cx="12" cy="19" r="2" fill="#00B0B9" />
      <circle cx="5" cy="12" r="2" fill="#00B0B9" />
      <circle cx="19" cy="12" r="2" fill="#00B0B9" />
    </svg>
  )
}
function AppleHealthLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path d="M12 21.5C7 21.5 3 17 3 12S7 2.5 12 2.5 21 7 21 12s-4 9.5-9 9.5z" fill="#FF2D55" opacity="0.2" />
      <path d="M12 8v4l2.5 2.5" stroke="#FF2D55" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 6.5c0-1.5 2-2.5 3-1 1-1.5 3-.5 3 1" stroke="#FF2D55" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function OuraLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#F59E0B" opacity="0.15" />
      <circle cx="12" cy="12" r="5" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="2" fill="#F59E0B" />
    </svg>
  )
}
function WithingsLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <circle cx="12" cy="12" r="10" fill="#6366F1" opacity="0.15" />
      <path d="M8 12.5l2 2 4-5" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function GoogleFitLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#34A853" opacity="0.2" />
      <path d="M7 12l3 3 7-7" stroke="#34A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function MyChartLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#0033A0" opacity="0.15" />
      <path d="M7 12h2l2-4 2 8 2-4h2" stroke="#0033A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SERVICES: ServiceDef[] = [
  {
    id: 'fitbit',
    name: 'Fitbit',
    tagline: 'Activity, heart rate, sleep, weight',
    dataTypes: ['Steps', 'Heart Rate', 'Sleep', 'Weight', 'Calories'],
    color: '#00B0B9',
    availability: 'available',
    acceptedFiles: '.csv',
    acceptMime: 'text/csv,application/csv,.csv',
    instructions: [
      'Go to fitbit.com and sign in to your account',
      'Click your profile picture → Settings → Data Export',
      'Click "Request Data" — Fitbit will email you a download link',
      'Open the ZIP and look inside the folders (e.g., Activities, Body, Sleep)',
      'Upload any individual CSV file (e.g., heart_rate-2024.csv, weight.csv, steps.csv)',
      'Repeat for each file type you want to import',
    ],
    logo: <FitbitLogo />,
  },
  {
    id: 'apple_health',
    name: 'Apple Health',
    tagline: 'Heart rate, vitals, sleep, activity',
    dataTypes: ['Heart Rate', 'Steps', 'Weight', 'Blood Pressure', 'Glucose'],
    color: '#FF2D55',
    availability: 'available',
    acceptedFiles: '.xml',
    acceptMime: 'text/xml,application/xml,.xml',
    instructions: [
      'Open the Health app on your iPhone',
      'Tap your profile picture in the top-right corner',
      'Tap "Export All Health Data" at the bottom',
      'Wait for the export to generate (may take a few minutes)',
      'Tap Share and send the export.zip to your computer',
      'Unzip it and upload the export.xml file below (max 15 MB)',
      'Tip: For large exports, use a shorter date range in your iPhone health settings',
    ],
    logo: <AppleHealthLogo />,
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    tagline: 'Sleep, HRV, readiness, activity',
    dataTypes: ['Sleep Score', 'HRV', 'Readiness', 'Steps', 'Temperature'],
    color: '#F59E0B',
    availability: 'available',
    acceptedFiles: '.csv',
    acceptMime: 'text/csv,application/csv,.csv',
    instructions: [
      'Open the Oura app on your phone',
      'Tap the Profile icon → Data Export',
      'Select the data type (Sleep, Readiness, Activity, Heart Rate)',
      'Choose a date range and tap Export',
      'Share the CSV to your computer',
      'Upload the CSV file below',
    ],
    logo: <OuraLogo />,
  },
  {
    id: 'withings',
    name: 'Withings',
    tagline: 'Weight, blood pressure, heart rate',
    dataTypes: ['Weight', 'BMI', 'Blood Pressure', 'Heart Rate', 'Body Fat'],
    color: '#6366F1',
    availability: 'available',
    acceptedFiles: '.csv',
    acceptMime: 'text/csv,application/csv,.csv',
    instructions: [
      'Go to healthmate.withings.com and sign in',
      'Click your profile → Settings → My Data',
      'Click "Export Measurements" and choose your date range',
      'Download the CSV file that is emailed to you',
      'Upload that CSV file below',
    ],
    logo: <WithingsLogo />,
  },
  {
    id: 'google_fit',
    name: 'Google Fit',
    tagline: 'Steps, calories, heart rate',
    dataTypes: ['Steps', 'Calories', 'Heart Rate', 'Weight'],
    color: '#34A853',
    availability: 'available',
    acceptedFiles: '.json',
    acceptMime: 'application/json,.json',
    instructions: [
      'Go to takeout.google.com and sign in',
      'Click "Deselect all", then scroll to "Fit" and check it',
      'Click "Next step" → "Create export"',
      'Wait for the email with your download link',
      'Extract the ZIP → open the "Takeout/Fit/Daily activity metrics" folder',
      'Upload any of the .json files below',
    ],
    logo: <GoogleFitLogo />,
  },
  {
    id: 'mychart',
    name: 'MyChart / Epic FHIR',
    tagline: 'Lab results, diagnoses, medications',
    dataTypes: ['Lab Results', 'Diagnoses', 'Medications', 'Visit Notes', 'Allergies'],
    color: '#0033A0',
    availability: 'coming_soon',
    acceptedFiles: '',
    acceptMime: '',
    instructions: [],
    logo: <MyChartLogo />,
  },
]

// ---------------------------------------------------------------------------
// Import state per service (stored in component memory)
// ---------------------------------------------------------------------------
interface ImportRecord {
  lastImport: string
  count: number
}

// ---------------------------------------------------------------------------
// Import Modal
// ---------------------------------------------------------------------------
interface ImportModalProps {
  service: ServiceDef
  onClose: () => void
  onSuccess: (serviceId: ServiceId, count: number) => void
}

function ImportModal({ service, onClose, onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [insertedCount, setInsertedCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(f: File | null) {
    if (!f) return
    setFile(f)
    setStatus('idle')
    setMessage('')
  }

  async function handleImport() {
    if (!file) return
    setStatus('loading')
    setMessage('')
    try {
      const fd = new FormData()
      fd.append('service', service.id)
      fd.append('file', file)
      const res = await fetch('/api/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(json.error || 'Import failed. Please try again.')
      } else {
        setStatus('success')
        setInsertedCount(json.inserted ?? json.total ?? 0)
        onSuccess(service.id, json.inserted ?? json.total ?? 0)
      }
    } catch (err: any) {
      setStatus('error')
      setMessage(err.message || 'Network error. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center">
              {service.logo}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Import {service.name} data</p>
              <p className="text-xs text-muted-foreground">{service.tagline}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Instructions */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              How to export from {service.name}
            </p>
            <ol className="space-y-1.5">
              {service.instructions.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-medium text-foreground/60 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Upload area */}
          {status !== 'success' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files[0] ?? null) }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                dragging ? 'border-cyan-400/60 bg-cyan-500/5' : 'border-white/10 hover:border-cyan-400/30 hover:bg-white/[0.02]'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept={service.acceptMime}
                className="hidden"
                onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm text-foreground truncate max-w-[260px]">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drop your file here or <span className="text-cyan-400">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-1">Accepts {service.acceptedFiles}</p>
                </>
              )}
            </div>
          )}

          {/* Status messages */}
          {status === 'error' && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{message}</p>
            </div>
          )}
          {status === 'success' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Import complete!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {insertedCount.toLocaleString()} data point{insertedCount !== 1 ? 's' : ''} added to your vitals.
                  Head to the <span className="text-cyan-400">Vitals</span> tab to see your data.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
          {status === 'success' ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || status === 'loading'}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  file && status !== 'loading'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30'
                    : 'bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed opacity-50'
                )}
              >
                {status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {status === 'loading' ? 'Importing…' : 'Import data'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------
export function ConnectedServicesTab() {
  const [activeModal, setActiveModal] = useState<ServiceId | null>(null)
  const [imports, setImports] = useState<Partial<Record<ServiceId, ImportRecord>>>({})

  const activeService = SERVICES.find(s => s.id === activeModal) ?? null

  function handleSuccess(serviceId: ServiceId, count: number) {
    setImports(prev => ({
      ...prev,
      [serviceId]: { lastImport: new Date().toISOString(), count },
    }))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass rounded-2xl p-5 border border-cyan-500/20">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Import Health Data</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Export your health data from your device or app and import it directly into Healyx. No account linking required — your data stays yours.
            </p>
          </div>
        </div>
      </div>

      {/* Service grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => {
          const importRecord = imports[service.id]
          const isAvailable = service.availability === 'available'

          return (
            <div
              key={service.id}
              className={cn(
                'glass rounded-2xl p-5 border flex flex-col gap-3 transition-colors',
                isAvailable
                  ? 'border-white/10 hover:border-cyan-500/30'
                  : 'border-white/5 opacity-60'
              )}
            >
              {/* Logo + name */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                    {service.logo}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.tagline}</p>
                  </div>
                </div>
                {!isAvailable && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
                    Soon
                  </span>
                )}
                {isAvailable && importRecord && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Imported
                  </span>
                )}
              </div>

              {/* Data type pills */}
              <div className="flex flex-wrap gap-1">
                {service.dataTypes.map(dt => (
                  <span key={dt} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5">
                    {dt}
                  </span>
                ))}
              </div>

              {/* Last import note */}
              {importRecord && (
                <p className="text-[11px] text-emerald-400">
                  ✓ {importRecord.count.toLocaleString()} records imported · {new Date(importRecord.lastImport).toLocaleDateString()}
                </p>
              )}

              {/* Action */}
              <div className="mt-auto pt-1">
                {isAvailable ? (
                  <button
                    onClick={() => setActiveModal(service.id)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {importRecord ? 'Import again' : 'Import data'}
                  </button>
                ) : (
                  <button disabled className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed opacity-50">
                    Coming soon
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Want OAuth auto-sync or a new integration?{' '}
        <span className="text-cyan-400">Let us know</span> and we&apos;ll prioritize it.
      </p>

      {/* Modal */}
      {activeModal && activeService && (
        <ImportModal
          service={activeService}
          onClose={() => setActiveModal(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
