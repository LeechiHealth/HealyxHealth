"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { Smile, Loader2, Check, ChevronDown } from "lucide-react"

// WHO-5 Well-Being Index — validated, 0–100. Five items, each 0 (At no time) … 5 (All of the time).
const QUESTIONS = [
  "I have felt cheerful and in good spirits",
  "I have felt calm and relaxed",
  "I have felt active and vigorous",
  "I woke up feeling fresh and rested",
  "My daily life has been filled with things that interest me",
]
const OPTIONS = [
  { v: 5, label: "All of the time" },
  { v: 4, label: "Most of the time" },
  { v: 3, label: "More than half" },
  { v: 2, label: "Less than half" },
  { v: 1, label: "Some of the time" },
  { v: 0, label: "At no time" },
]

export function WellbeingCheckin() {
  const { user } = useAuth()
  const [latest, setLatest] = React.useState<any>(null)
  const [open, setOpen] = React.useState(false)
  const [answers, setAnswers] = React.useState<(number | null)[]>([null, null, null, null, null])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase.from("qol_responses").select("score, taken_at")
        .eq("user_id", user.id).order("taken_at", { ascending: false }).limit(1).maybeSingle()
      setLatest(data)
    })()
  }, [user])

  const complete = answers.every((a) => a !== null)
  const raw = answers.reduce<number>((s, a) => s + (a ?? 0), 0)
  const score = raw * 4

  async function save() {
    if (!user || !complete || saving) return
    setSaving(true)
    const { error } = await supabase.from("qol_responses").insert({
      user_id: user.id, instrument: "who5", item_scores: answers, raw_score: raw, score,
    })
    if (!error) {
      setLatest({ score, taken_at: new Date().toISOString() })
      setOpen(false)
      setAnswers([null, null, null, null, null])
    }
    setSaving(false)
  }

  return (
    <section className="mt-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 shrink-0">
            <Smile className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Well-being check-in</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {latest?.score != null
                ? `Last score ${latest.score}/100 · how are you really doing?`
                : "A quick, validated 5-question pulse on how you feel"}
            </p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            <p className="text-xs text-muted-foreground">Over the last two weeks…</p>
            {QUESTIONS.map((q, qi) => (
              <div key={qi}>
                <p className="text-sm text-foreground mb-2">{q}</p>
                <div className="flex flex-wrap gap-1.5">
                  {OPTIONS.map((o) => {
                    const sel = answers[qi] === o.v
                    return (
                      <button key={o.v}
                        onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? o.v : a)))}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${sel ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">{complete ? `Score: ${score}/100` : `${answers.filter((a) => a !== null).length}/5 answered`}</p>
              <button onClick={save} disabled={!complete || saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save check-in
              </button>
            </div>
            {complete && score < 50 && (
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                A lower score here can be an early signal of low mood. It might help to talk it through with someone you trust or your doctor.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
