"use client"

import { FlaskConical, TrendingUp, MessageCircle, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useBiomarkers } from "@/hooks/useBiomarkers"

export function HealthScoreCards() {
  const { biomarkers, loading } = useBiomarkers()
  const router = useRouter()

  // Get most recent biomarker as sample
  const recentBiomarker = biomarkers && biomarkers.length > 0 ? biomarkers[0] : null
  const biomarkerCount = biomarkers?.length || 0

  // Get last upload date
  const lastUploadDate = recentBiomarker
    ? new Date(recentBiomarker.test_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : 'Never'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Recent Labs Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/80 to-primary/80 p-5 text-foreground min-h-[160px] border border-primary/30 glow-cyan">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-primary/80">Recent Labs</p>
          </div>
          <p className="text-3xl font-light text-primary">
            {loading ? "..." : biomarkerCount} {biomarkerCount === 1 ? "report" : "reports"}
          </p>
          <p className="text-xs text-primary/60 mt-3">
            Last uploaded {lastUploadDate}
          </p>
          <Link
            href="/data"
            className="inline-block mt-3 text-xs text-primary hover:text-primary transition-colors"
          >
            View all results
          </Link>
        </div>
      </div>

      {/* Trends Card */}
      <div className="relative overflow-hidden rounded-2xl glass p-5 min-h-[160px]">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-health-normal" />
            <p className="text-sm font-medium text-muted-foreground">Trend Highlights</p>
          </div>
          <div className="space-y-2 mt-2">
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading trends...</p>
            ) : biomarkers && biomarkers.length > 0 ? (
              biomarkers.slice(0, 3).map((biomarker) => (
                <div key={biomarker.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground/80">{biomarker.name}</span>
                  <span className={`text-xs ${
                    biomarker.status === 'optimal' ? 'text-health-optimal' :
                    biomarker.status === 'normal' ? 'text-health-normal' :
                    biomarker.status === 'borderline' ? 'text-health-warning' :
                    'text-health-critical'
                  }`}>
                    {biomarker.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No biomarkers yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Card */}
      <div className="relative overflow-hidden rounded-2xl glass p-5 min-h-[160px]">
        <div className="relative z-10">
          <p className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</p>
          <div className="space-y-2">
            <button onClick={() => router.push("/data")} className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg bg-secondary hover:bg-primary/10 transition-colors text-left group">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">Upload new lab</span>
            </button>
            <Link
              href="/home"
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg bg-secondary hover:bg-primary/10 transition-colors group"
            >
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">Ask about your results</span>
            </Link>
            <Link
              href="/insights"
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg bg-secondary hover:bg-primary/10 transition-colors group"
            >
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">Browse clinical references</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}