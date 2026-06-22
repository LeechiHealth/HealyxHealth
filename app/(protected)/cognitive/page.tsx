"use client"

import * as React from "react"
import { Header } from "@/components/header"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/components/AuthContext"
import { Brain, Zap, Shuffle, Loader2, RotateCcw } from "lucide-react"

// A CNS-Vital-Signs-style mini battery: Reaction Time (psychomotor speed / vigilance)
// and Stroop (cognitive flexibility / inhibition). Scores are stored to
// cognitive_test_results. NOTE: percentiles are placeholders until normative data
// is added — see the Todoist task for full normative validation.

type Stage = "intro" | "rt" | "rt_done" | "stroop" | "stroop_done" | "saving" | "done"

const COLORS = [
  { name: "RED", hex: "#E24B4A" },
  { name: "BLUE", hex: "#3B82F6" },
  { name: "GREEN", hex: "#1D9E75" },
  { name: "YELLOW", hex: "#E0A03B" },
]

const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0)
// rough RT→0-100 mapping (provisional, pre-normative)
const rtScore = (ms: number) => Math.max(0, Math.min(100, Math.round(140 - ms / 4)))

export default function CognitivePage() {
  const { user } = useAuth()
  const [stage, setStage] = React.useState<Stage>("intro")

  // ── Reaction time ──
  const RT_TRIALS = 8
  const [rtState, setRtState] = React.useState<"wait" | "ready" | "go">("wait")
  const [rtTimes, setRtTimes] = React.useState<number[]>([])
  const [rtFalseStarts, setRtFalseStarts] = React.useState(0)
  const rtStartRef = React.useRef(0)
  const rtTimerRef = React.useRef<any>(null)

  function startRtTrial() {
    setRtState("ready")
    const delay = 1200 + Math.random() * 2800
    rtTimerRef.current = setTimeout(() => {
      rtStartRef.current = performance.now()
      setRtState("go")
    }, delay)
  }
  function rtTap() {
    if (rtState === "ready") {
      clearTimeout(rtTimerRef.current)
      setRtFalseStarts((n) => n + 1)
      setRtState("wait")
      return
    }
    if (rtState === "go") {
      const rt = Math.round(performance.now() - rtStartRef.current)
      const next = [...rtTimes, rt]
      setRtTimes(next)
      setRtState("wait")
      if (next.length >= RT_TRIALS) setStage("rt_done")
    }
  }

  // ── Stroop ──
  const STROOP_TRIALS = 12
  const [stroopItem, setStroopItem] = React.useState<{ word: string; inkIdx: number } | null>(null)
  const [stroopRts, setStroopRts] = React.useState<number[]>([])
  const [stroopCongruentRts, setStroopCongruentRts] = React.useState<number[]>([])
  const [stroopCorrect, setStroopCorrect] = React.useState(0)
  const [stroopN, setStroopN] = React.useState(0)
  const stroopStartRef = React.useRef(0)
  const stroopCongruentRef = React.useRef(false)

  function nextStroop() {
    const wordIdx = Math.floor(Math.random() * COLORS.length)
    let inkIdx = Math.floor(Math.random() * COLORS.length)
    const congruent = Math.random() < 0.4
    if (congruent) inkIdx = wordIdx
    else if (inkIdx === wordIdx) inkIdx = (inkIdx + 1) % COLORS.length
    stroopCongruentRef.current = inkIdx === wordIdx
    setStroopItem({ word: COLORS[wordIdx].name, inkIdx })
    stroopStartRef.current = performance.now()
  }
  function stroopAnswer(choiceIdx: number) {
    if (!stroopItem) return
    const rt = Math.round(performance.now() - stroopStartRef.current)
    const correct = choiceIdx === stroopItem.inkIdx
    if (correct) {
      setStroopCorrect((c) => c + 1)
      setStroopRts((a) => [...a, rt])
      if (stroopCongruentRef.current) setStroopCongruentRts((a) => [...a, rt])
    }
    const n = stroopN + 1
    setStroopN(n)
    if (n >= STROOP_TRIALS) { setStroopItem(null); setStage("stroop_done") }
    else nextStroop()
  }

  async function saveAndFinish() {
    if (!user) { setStage("done"); return }
    setStage("saving")
    const rtMean = mean(rtTimes), rtMed = median(rtTimes)
    const lapses = rtTimes.filter((t) => t > 500).length
    const stroopMean = mean(stroopRts)
    const stroopAcc = Math.round((stroopCorrect / Math.max(STROOP_TRIALS, 1)) * 100)
    const interference = stroopMean - (mean(stroopCongruentRts) || stroopMean)
    try {
      await supabase.from("cognitive_test_results").insert([
        {
          user_id: user.id, test_type: "pvt", phase: "baseline",
          pvt_mean_rt_ms: rtMean, pvt_median_rt_ms: rtMed, pvt_false_starts: rtFalseStarts, pvt_lapses: lapses,
          composite_score: rtScore(rtMean), raw_data: { rts: rtTimes },
        },
        {
          user_id: user.id, test_type: "stroop", phase: "baseline",
          stroop_mean_rt_ms: stroopMean, stroop_accuracy_pct: stroopAcc, stroop_interference_ms: Math.max(0, Math.round(interference)),
          composite_score: Math.round((rtScore(stroopMean) + stroopAcc) / 2), raw_data: { rts: stroopRts },
        },
      ])
    } catch {}
    setStage("done")
  }

  const rtMean = mean(rtTimes)
  const stroopAcc = Math.round((stroopCorrect / Math.max(STROOP_TRIALS, 1)) * 100)

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-6 pb-24 md:pb-12">
        <div className="mb-5">
          <h1 className="text-2xl font-medium text-foreground flex items-center gap-2"><Brain className="h-6 w-6 text-primary" /> Brain check</h1>
          <p className="text-sm text-muted-foreground mt-0.5">A quick set of timed tasks that measure speed, attention, and focus.</p>
        </div>

        {stage === "intro" && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <p className="text-sm text-foreground/90 leading-relaxed">Two short tasks, about 3 minutes total. Find a quiet moment — you'll get a score for each and we'll track it over time.</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Reaction time — tap the instant the screen turns green</div>
              <div className="flex items-center gap-2"><Shuffle className="h-4 w-4 text-primary" /> Stroop — tap the <em>ink color</em>, not the word</div>
            </div>
            <button onClick={() => setStage("rt")} className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Start</button>
            <p className="text-[11px] text-muted-foreground/70">Educational cognitive screening, not a medical diagnosis.</p>
          </div>
        )}

        {/* Reaction time */}
        {stage === "rt" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Trial {rtTimes.length + 1} of {RT_TRIALS} · false starts: {rtFalseStarts}</p>
            <button
              onClick={() => (rtState === "wait" ? startRtTrial() : rtTap())}
              className={`w-full rounded-2xl h-64 flex flex-col items-center justify-center text-lg font-medium transition-colors ${rtState === "go" ? "bg-health-optimal text-background" : rtState === "ready" ? "bg-health-danger/80 text-white" : "bg-card border border-border text-foreground"}`}
            >
              {rtState === "wait" && "Tap to begin trial"}
              {rtState === "ready" && "Wait for green…"}
              {rtState === "go" && "TAP NOW!"}
            </button>
            {rtTimes.length > 0 && <p className="text-xs text-muted-foreground text-center">Last: {rtTimes[rtTimes.length - 1]} ms</p>}
          </div>
        )}
        {stage === "rt_done" && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Reaction time</p>
            <p className="text-3xl font-medium text-foreground">{rtMean} ms</p>
            <p className="text-xs text-muted-foreground">avg over {rtTimes.length} taps · {rtTimes.filter((t) => t > 500).length} lapses</p>
            <button onClick={() => { setStroopN(0); setStage("stroop"); nextStroop() }} className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Next: Stroop</button>
          </div>
        )}

        {/* Stroop */}
        {stage === "stroop" && stroopItem && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">{stroopN + 1} of {STROOP_TRIALS} · tap the COLOR of the text</p>
            <div className="rounded-2xl border border-border bg-card h-40 flex items-center justify-center">
              <span className="text-5xl font-bold" style={{ color: COLORS[stroopItem.inkIdx].hex }}>{stroopItem.word}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((c, idx) => (
                <button key={c.name} onClick={() => stroopAnswer(idx)}
                  className="rounded-xl py-3 text-sm font-medium text-white" style={{ background: c.hex }}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {stage === "stroop_done" && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Stroop</p>
            <p className="text-3xl font-medium text-foreground">{stroopAcc}%</p>
            <p className="text-xs text-muted-foreground">accuracy · avg {mean(stroopRts)} ms</p>
            <button onClick={saveAndFinish} className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">See my results</button>
          </div>
        )}

        {stage === "saving" && <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

        {stage === "done" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-health-optimal/20 bg-health-optimal/[0.06] p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Your brain check</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">Reaction time</p>
                  <p className="text-xl font-medium text-foreground mt-1">{rtMean} ms</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Score {rtScore(rtMean)}/100</p>
                </div>
                <div className="rounded-xl bg-card border border-border p-3">
                  <p className="text-xs text-muted-foreground">Stroop accuracy</p>
                  <p className="text-xl font-medium text-foreground mt-1">{stroopAcc}%</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">avg {mean(stroopRts)} ms</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-3">Saved. Retake periodically to see your trend. Percentiles vs. age norms are coming.</p>
            </div>
            <button onClick={() => location.reload()} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Take it again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
