"use client"

import { MessageSquare, Pill } from "lucide-react"
import { Button } from "@/components/ui/button"

const medications = [
  {
    id: 1,
    name: "Propranolol 40mg tablet",
    dosage: "40 mg",
    schedule: "Every 12 hours with meals",
    instructions:
      "Take with food. Do not stop abruptly. Monitor heart rate and blood pressure.",
  },
]

export function MedicationsList() {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Your Medications
      </h3>
      <div className="space-y-3">
        {medications.map((med) => (
          <div
            key={med.id}
            className="glass rounded-2xl p-5 border border-primary/20 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/20 border border-primary/30">
                  <Pill className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">1</span>
                  <h4 className="font-medium text-foreground">{med.name}</h4>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary hover:bg-primary/10"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Ask
              </Button>
            </div>
            <div className="flex items-center gap-4 mb-2">
              <span className="text-sm text-foreground font-medium">{med.dosage}</span>
              <span className="text-sm text-muted-foreground">{"·"}</span>
              <span className="text-sm text-muted-foreground">{med.schedule}</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {med.instructions}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
