"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { X, Loader2, ShieldCheck } from "lucide-react"

const GOALS = ["Longevity", "Energy", "Weight", "Sleep", "Disease prevention", "Cognition"]
const DIETS = ["Omnivore", "Mediterranean", "Low-carb / keto", "Vegetarian", "Vegan", "Lots of processed food"]
const NICOTINE = ["Never", "Former", "Current"]
const SUPP = ["Yes", "Only if proven", "Prefer not to"]

function Pills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${value === o ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
          {o}
        </button>
      ))}
    </div>
  )
}
function Scale({ value, onChange, max = 10 }: { value: number | null; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max + 1 }, (_, i) => i).map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-md border text-xs transition-colors ${value === n ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
          {n}
        </button>
      ))}
    </div>
  )
}

export function ProtocolIntake({ existing, onClose, onSaved }: { existing?: any; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [complaint, setComplaint] = React.useState(existing?.chief_complaint || "")
  const [goal, setGoal] = React.useState(existing?.primary_goal || "")
  const [sleep, setSleep] = React.useState<string>(existing?.sleep_hours != null ? String(existing.sleep_hours) : "")
  const [exercise, setExercise] = React.useState<number | null>(existing?.exercise_days ?? null)
  const [stress, setStress] = React.useState<number | null>(existing?.stress_level ?? null)
  const [diet, setDiet] = React.useState(existing?.diet_description || "")
  const [nicotine, setNicotine] = React.useState(existing?.nicotine || "")
  const [supp, setSupp] = React.useState(existing?.supplement_willingness || "")
  const [consent, setConsent] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const canSave = !!goal && consent

  async function save() {
    if (!user || !canSave || saving) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from("intake_responses").insert({
      user_id: user.id,
      chief_complaint: complaint || null,
      primary_goal: goal || null,
      sleep_hours: sleep ? Number(sleep) : null,
      exercise_days: exercise,
      stress_level: stress,
      diet_description: diet || null,
      nicotine: nicotine || null,
      supplement_willingness: supp || null,
      completed: true,
      completed_at: new Date().toISOString(),
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-lg my-8 rounded-2xl border border-border bg-background p-5 sm:p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-medium text-foreground">Health questionnaire</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-5">A few questions so your protocol fits you. Takes about a minute.</p>

        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground">What's the one thing you'd most like to improve?</label>
            <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2}
              placeholder="e.g. I crash every afternoon and sleep poorly"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Your main goal <span className="text-health-danger">*</span></label>
            <div className="mt-2"><Pills options={GOALS} value={goal} onChange={setGoal} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Hours of sleep on a typical night</label>
            <input type="number" min={3} max={14} step={0.5} value={sleep} onChange={(e) => setSleep(e.target.value)}
              placeholder="e.g. 6.5"
              className="mt-2 w-28 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Days per week you exercise</label>
            <div className="mt-2"><Scale value={exercise} onChange={setExercise} max={7} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Current stress level (0 calm – 10 maxed)</label>
            <div className="mt-2"><Scale value={stress} onChange={setStress} max={10} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">How would you describe your diet?</label>
            <div className="mt-2"><Pills options={DIETS} value={diet} onChange={setDiet} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Nicotine use</label>
            <div className="mt-2"><Pills options={NICOTINE} value={nicotine} onChange={setNicotine} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Open to supplements?</label>
            <div className="mt-2"><Pills options={SUPP} value={supp} onChange={setSupp} /></div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span className="text-xs text-muted-foreground leading-relaxed">
                <ShieldCheck className="inline h-3.5 w-3.5 text-primary mr-1 -mt-0.5" />
                I understand this is educational wellness guidance, not medical care, and I consent to Healyx using my answers (stored privately under my account) to build my plan.
              </span>
            </label>
          </div>

          {err && <p className="text-xs text-health-danger">{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={save} disabled={!canSave || saving}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save & build my protocol
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
