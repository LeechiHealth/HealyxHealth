"use client"

import { ExternalLink, Plus, CheckCircle, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Reference {
  id: number
  title: string
  authors: string
  journal: string
  year: string
  source: string
  verified: boolean
  type: string
  description: string
}

const references: Reference[] = [
  {
    id: 1,
    title:
      "2023 Focused Update of the 2021 ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
    authors: "McDonagh TA, Metra M, Adamo M, et al.",
    journal: "European Heart Journal",
    year: "2023",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Comprehensive ESC guidelines for HF diagnosis and management including pharmacotherapy, devices, and comorbidities.",
  },
  {
    id: 2,
    title:
      "2023 ESC Guidelines for the management of cardiovascular disease in patients with diabetes",
    authors: "Marx N, Federici M, Schutt K, et al.",
    journal: "European Heart Journal",
    year: "2023",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Guidelines for CVD management in diabetic patients, including risk assessment and treatment targets.",
  },
  {
    id: 3,
    title:
      "Beta-Blockers for the Treatment of Premature Ventricular Contractions: A Meta-Analysis",
    authors: "Ling Y, Wan Q, Chen Q, Zhu W.",
    journal: "Journal of Cardiovascular Pharmacology",
    year: "2023",
    source: "PubMed",
    verified: true,
    type: "meta_analysis",
    description:
      "Meta-analysis of beta-blocker efficacy for PVC suppression, relevant to patient scenario (Propranolol for PVCs).",
  },
  {
    id: 4,
    title:
      "2023 AHA/ACC/ACCP/ASPC/NLA/PCNA Guideline for the Management of Patients With Chronic Coronary Disease",
    authors: "Virani SS, Newby LK, Arnold SV, et al.",
    journal: "Circulation",
    year: "2023",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Comprehensive guideline for chronic coronary disease management including medical therapy, revascularization, and risk reduction.",
  },
  {
    id: 5,
    title:
      "2022 ESC Guidelines on ventricular arrhythmias and the prevention of sudden cardiac death",
    authors: "Zeppenfeld K, Tfelt-Hansen J, de Riva M, et al.",
    journal: "European Heart Journal",
    year: "2022",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Guidelines on evaluation and management of ventricular arrhythmias and prevention of sudden cardiac death, including PVCs.",
  },
  {
    id: 6,
    title:
      "2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure",
    authors: "Heidenreich PA, Bozkurt B, Aguilar D, et al.",
    journal: "Circulation",
    year: "2022",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "AHA/ACC/HFSA guideline covering classification, biomarkers, imaging, pharmacologic and device therapy for heart failure.",
  },
  {
    id: 7,
    title:
      "2021 ESC Guidelines on cardiovascular disease prevention in clinical practice",
    authors: "Visseren FLJ, Mach F, Smulders R, et al.",
    journal: "European Heart Journal",
    year: "2021",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Prevention guidelines covering risk factors, lifestyle modification, and pharmacological interventions.",
  },
  {
    id: 8,
    title:
      "2019 ESC/EAS Guidelines for the management of dyslipidaemias",
    authors: "Mach F, Baigent C, Catapano AL, et al.",
    journal: "European Heart Journal",
    year: "2020",
    source: "PubMed",
    verified: true,
    type: "guideline",
    description:
      "Dyslipidemia management guidelines including LDL targets, statin therapy, and combination treatments.",
  },
]

function TypeBadge({ type }: { type: string }) {
  const label = type === "meta_analysis" ? "Meta-analysis" : type.charAt(0).toUpperCase() + type.slice(1)
  return (
    <Badge
      variant="secondary"
      className="text-xs bg-secondary/80 text-muted-foreground border border-border"
    >
      {label}
    </Badge>
  )
}

export function ClinicalReferences() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Clinical References
          <span className="ml-2 text-cyan-400">{references.length}</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Reference
        </Button>
      </div>

      <div className="space-y-3">
        {references.map((ref) => (
          <div
            key={ref.id}
            className="glass rounded-2xl p-5 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors group"
          >
            <h4 className="font-medium text-foreground leading-snug mb-2 text-balance">
              {ref.title}
            </h4>
            <p className="text-sm text-muted-foreground mb-3">{ref.authors}</p>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground">
                {ref.journal} ({ref.year})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge
                variant="secondary"
                className="text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
              >
                {ref.source}
              </Badge>
              {ref.verified && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Verified
                </Badge>
              )}
              <TypeBadge type={ref.type} />
              <button className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors ml-auto">
                <ExternalLink className="h-3 w-3" />
                View source
              </button>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {ref.description}
            </p>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-xl border border-border bg-secondary/30">
        <div className="flex items-start gap-3">
          <BookOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            All clinical scenarios, patient data, and medical records displayed in this
            application are entirely fictional, created for demonstration purposes only,
            and do not depict any real person or actual medical encounter.
          </p>
        </div>
      </div>
    </div>
  )
}
