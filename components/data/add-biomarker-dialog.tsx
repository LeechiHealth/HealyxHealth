"use client"

import * as React from "react"
import { Plus, Upload, FileText, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { cn } from "@/lib/utils"

const BIOMARKER_TYPES = [
  "Cholesterol Total", "HDL Cholesterol", "LDL Cholesterol", "Triglycerides",
  "Glucose", "Hemoglobin A1C", "TSH", "T4 Free", "T3 Free",
  "Vitamin D", "B12", "Folate", "Iron", "Ferritin", "TIBC",
  "Creatinine", "BUN", "eGFR", "ALT", "AST", "Alkaline Phosphatase",
  "Total Bilirubin", "Albumin", "Total Protein", "Sodium", "Potassium",
  "Chloride", "CO2", "Calcium", "Magnesium", "Phosphorus",
  "WBC", "RBC", "Hemoglobin", "Hematocrit", "MCV", "Platelets",
  "PSA", "CRP", "Homocysteine", "HbA1c", "Uric Acid",
] as const

interface ExtractedBiomarker {
  name: string
  value: number
  unit: string
  test_date: string
  reference_range_text: string | null
  status: string | null
  selected: boolean
}

type Mode = 'manual' | 'upload'

export function AddBiomarkerDialog({ onSuccess }: { onSuccess?: () => void }) {
  const { user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [mode, setMode] = React.useState<Mode>('manual')
  const [loading, setLoading] = React.useState(false)
  const [submitError, setSubmitError] = React.useState("")

  // Manual form
  const [formData, setFormData] = React.useState({
    type: "",
    customName: "",
    value: "",
    unit: "",
    date: new Date().toISOString().split('T')[0],
  })

  // Upload state
  const [fileName, setFileName] = React.useState("")
  const [extracting, setExtracting] = React.useState(false)
  const [extracted, setExtracted] = React.useState<ExtractedBiomarker[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function reset() {
    setFormData({ type: "", customName: "", value: "", unit: "", date: new Date().toISOString().split('T')[0] })
    setFileName("")
    setExtracted([])
    setSubmitError("")
    setMode('manual')
  }

  const handleClose = (v: boolean) => {
    setOpen(v)
    if (!v) reset()
  }

  // ── Manual submit ──
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSubmitError("")
    setLoading(true)
    try {
      const biomarkerName = formData.type === '__custom__' ? formData.customName : formData.type
      if (!biomarkerName) { setSubmitError("Please select or enter a biomarker name."); setLoading(false); return }

      const { error } = await supabase.from('biomarkers').insert({
        user_id: user.id,
        name: biomarkerName,
        value: parseFloat(formData.value),
        unit: formData.unit,
        test_date: formData.date,
      }).select()

      if (error) throw error

      handleClose(false)
      onSuccess?.()
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to add biomarker. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── File upload → AI extract ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setExtracted([])
    setSubmitError("")
    setExtracting(true)

    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/labs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type, fileName: file.name }),
      })
      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || 'Extraction failed. Please try again or add manually.')
        return
      }

      if (!data.biomarkers?.length) {
        setSubmitError(data.message || 'No biomarkers found. You can add them manually instead.')
        return
      }

      setExtracted(data.biomarkers.map((b: any) => ({ ...b, selected: true })))
    } catch (err: any) {
      setSubmitError(err.message || 'Upload failed.')
    } finally {
      setExtracting(false)
    }
  }

  const toggleExtracted = (i: number) => {
    setExtracted(prev => prev.map((b, idx) => idx === i ? { ...b, selected: !b.selected } : b))
  }

  const handleSaveExtracted = async () => {
    if (!user) return
    const toSave = extracted.filter(b => b.selected)
    if (!toSave.length) return

    setLoading(true)
    setSubmitError("")
    try {
      const rows = toSave.map(b => ({
        user_id: user.id,
        name: b.name,
        value: b.value,
        unit: b.unit,
        test_date: b.test_date,
        reference_range_text: b.reference_range_text,
        status: b.status,
      }))
      const { error } = await supabase.from('biomarkers').insert(rows)
      if (error) throw error
      handleClose(false)
      onSuccess?.()
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to save results.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30">
          <Plus className="h-4 w-4 mr-2" />
          Add Lab Result
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Lab Result</DialogTitle>
        </DialogHeader>

        {/* Mode switcher */}
        <div className="flex gap-1 p-1 bg-secondary rounded-lg mb-2">
          <button
            onClick={() => setMode('manual')}
            className={cn("flex-1 text-sm py-1.5 rounded-md transition-colors", mode === 'manual' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            Manual Entry
          </button>
          <button
            onClick={() => setMode('upload')}
            className={cn("flex-1 text-sm py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5", mode === 'upload' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload PDF
          </button>
        </div>

        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
            {submitError}
          </div>
        )}

        {/* ── Manual mode ── */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <Label>Biomarker</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select biomarker" /></SelectTrigger>
                <SelectContent>
                  {BIOMARKER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value="__custom__">Other (type below)</SelectItem>
                </SelectContent>
              </Select>
              {formData.type === '__custom__' && (
                <Input
                  className="mt-2"
                  placeholder="e.g. Free Testosterone"
                  value={formData.customName}
                  onChange={(e) => setFormData({ ...formData, customName: e.target.value })}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="value">Value</Label>
                <Input id="value" type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" placeholder="mg/dL" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label htmlFor="date">Test Date</Label>
              <Input id="date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button type="submit" disabled={loading} className="bg-cyan-500 text-white hover:bg-cyan-600">
                {loading ? "Adding…" : "Add Result"}
              </Button>
            </div>
          </form>
        )}

        {/* ── Upload mode ── */}
        {mode === 'upload' && (
          <div className="space-y-4">
            {/* Drop zone */}
            {!fileName && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-cyan-500/30 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-colors"
              >
                <div className="h-12 w-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-cyan-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Upload lab report</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF or text file • AI will extract biomarkers automatically</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            )}

            {/* Extracting state */}
            {extracting && (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
                <p className="text-sm text-muted-foreground">Reading <span className="text-foreground">{fileName}</span>…</p>
                <p className="text-xs text-muted-foreground">AI is extracting biomarkers</p>
              </div>
            )}

            {/* Extracted results */}
            {extracted.length > 0 && !extracting && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-400" />
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{extracted.filter(b => b.selected).length} of {extracted.length} selected</p>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                  {extracted.map((b, i) => (
                    <div
                      key={i}
                      onClick={() => toggleExtracted(i)}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors",
                        b.selected ? "bg-cyan-500/10 border-cyan-500/30" : "bg-secondary border-border opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={cn("h-4 w-4 rounded flex items-center justify-center flex-shrink-0", b.selected ? "bg-cyan-500" : "border border-border")}>
                          {b.selected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-sm text-foreground truncate">{b.name}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-sm font-medium text-foreground">{b.value}</span>
                        <span className="text-xs text-muted-foreground ml-1">{b.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => { setFileName(""); setExtracted([]); setSubmitError("") }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Try another file
                  </button>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleClose(false)}>Cancel</Button>
                    <Button
                      onClick={handleSaveExtracted}
                      disabled={loading || !extracted.some(b => b.selected)}
                      className="bg-cyan-500 text-white hover:bg-cyan-600"
                      size="sm"
                    >
                      {loading ? "Saving…" : `Save ${extracted.filter(b => b.selected).length} Results`}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Helper: File → base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // strip data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
