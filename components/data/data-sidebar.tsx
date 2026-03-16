"use client"

import { cn } from "@/lib/utils"
import { Heart, Zap, Activity, Shield, Pill, Flame, Apple, Droplets, Brain, Atom, Syringe, CheckCircle } from "lucide-react"

const categories = [
  { name: "All data", icon: CheckCircle, grade: null },
  { name: "Longevity Markers", icon: Zap, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Heart health", icon: Heart, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Thyroid Health", icon: Activity, grade: "B", color: "text-yellow-400 border-yellow-400" },
  { name: "Immune Regulation", icon: Shield, grade: "B", color: "text-yellow-400 border-yellow-400" },
  { name: "Hormone Health", icon: Pill, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Metabolic Health", icon: Flame, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Nutrients", icon: Apple, grade: "C", color: "text-amber-400 border-amber-400" },
  { name: "Liver Health", icon: Droplets, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Kidney Health", icon: Brain, grade: "B", color: "text-yellow-400 border-yellow-400" },
  { name: "Heavy Metals & Electrolytes", icon: Atom, grade: "A", color: "text-cyan-400 border-cyan-400" },
  { name: "Inflammation", icon: Syringe, grade: "B", color: "text-yellow-400 border-yellow-400" },
  { name: "Blood", icon: Droplets, grade: "A", color: "text-cyan-400 border-cyan-400" },
]

interface DataSidebarProps {
  selectedCategory: string
  onCategoryChange: (category: string) => void
}

export function DataSidebar({ selectedCategory, onCategoryChange }: DataSidebarProps) {
  return (
    <aside className="w-64 shrink-0">
      <nav className="space-y-1">
        {categories.map((category) => {
          const isActive = selectedCategory === category.name
          return (
            <button
              key={category.name}
              onClick={() => onCategoryChange(category.name)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 text-sm rounded-lg transition-colors text-left",
                isActive
                  ? "glass border border-cyan-500/30 font-medium text-foreground glow-cyan"
                  : "hover:bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {category.grade ? (
                <span className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-full border-2 text-xs font-semibold",
                  category.color
                )}>
                  {category.grade}
                </span>
              ) : (
                <category.icon className="h-5 w-5 text-cyan-400" />
              )}
              <span className="truncate">{category.name}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}