"use client"

import { cn } from "@/lib/utils"
import { Heart, Search, BookOpen, Pill, AlertCircle, Library } from "lucide-react"

const sidebarSections = [
  { name: "Relevant for You", icon: Heart, active: true },
  { name: "Search Databases", icon: Search, active: false },
  { name: "My Library", icon: Library, active: false },
]

interface InsightsSidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function InsightsSidebar({ activeSection, onSectionChange }: InsightsSidebarProps) {
  return (
    <aside className="w-64 shrink-0">
      <nav className="space-y-1 mb-8">
        {sidebarSections.map((section) => (
          <button
            key={section.name}
            onClick={() => onSectionChange(section.name)}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors text-left",
              activeSection === section.name
                ? "glass border border-cyan-500/30 font-medium text-foreground glow-cyan"
                : "hover:bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <section.icon className={cn(
              "h-5 w-5",
              activeSection === section.name ? "text-cyan-400" : "text-muted-foreground"
            )} />
            <span className="truncate">{section.name}</span>
          </button>
        ))}
      </nav>

      {/* Conditions Section */}
      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-3">Your Conditions</h3>
        <div className="space-y-1">
          <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors text-left hover:bg-secondary text-muted-foreground hover:text-foreground">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="truncate">Premature ventricular contractions</span>
          </button>
        </div>
      </div>

      {/* Medications Section */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-3">Your Medications</h3>
        <div className="space-y-1">
          <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors text-left hover:bg-secondary text-muted-foreground hover:text-foreground">
            <Pill className="h-4 w-4 text-cyan-400" />
            <span className="truncate">Propranolol 40mg</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
