"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Home, Database, BookOpen, ListChecks, Sparkles, ArrowRight, X } from "lucide-react"

const KEY = "healyx_onboarded_v1"

const STEPS = [
  { icon: Sparkles, title: "Welcome to Healyx", body: "Your health, finally in plain English. Here's a 30-second tour of what you can do." },
  { icon: Home, title: "Ask anything", body: "On Home, type or speak a health question — or upload a lab photo or PDF. The assistant already knows your record and answers simply." },
  { icon: Database, title: "Add your health info", body: "On the Data tab, add your conditions, medications, vitals, and lab results. The more you add, the smarter your score and plan get." },
  { icon: BookOpen, title: "Look up the research", body: "On Insights, search any condition or treatment and get the real evidence — explained in plain language." },
  { icon: ListChecks, title: "Get your protocol", body: "On Protocol, answer a 1-minute questionnaire and get a personalized 4-week plan with a board and calendar. It adapts every month." },
]

export function Onboarding() {
  const [open, setOpen] = React.useState(false)
  const [i, setI] = React.useState(0)
  const router = useRouter()

  React.useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true) } catch {}
  }, [])

  if (!open) return null

  const finish = (go?: string) => {
    try { localStorage.setItem(KEY, "1") } catch {}
    setOpen(false)
    if (go) router.push(go)
  }

  const step = STEPS[i]
  const Icon = step.icon
  const last = i === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-6 text-center">
        <button onClick={() => finish()} aria-label="Skip tour"
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-4 mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-medium text-foreground">{step.title}</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.body}</p>

        <div className="flex justify-center gap-1.5 my-5">
          {STEPS.map((_, n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => (i === 0 ? finish() : setI(i - 1))}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">
            {i === 0 ? "Skip" : "Back"}
          </button>
          <button onClick={() => (last ? finish("/data") : setI(i + 1))}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            {last ? "Get started" : "Next"} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
