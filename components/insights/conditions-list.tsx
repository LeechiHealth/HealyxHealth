"use client"

import { MessageSquare, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

const conditions = [
  {
    id: 1,
    name: "Premature ventricular contractions",
    notes:
      "Patient reports frequent palpitations for 3 weeks. EKG confirms frequent PVCs. Echocardiogram shows preserved EF. Starting beta-blocker therapy.",
  },
]

export function ConditionsList() {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Your Conditions
      </h3>
      <div className="space-y-3">
        {conditions.map((condition) => (
          <div
            key={condition.id}
            className="glass rounded-2xl p-5 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 border border-amber-500/30">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">1</span>
                  <h4 className="font-medium text-foreground">{condition.name}</h4>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Ask
              </Button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {condition.notes}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
