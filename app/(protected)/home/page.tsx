"use client"

import { HomeHero } from "@/components/home/home-hero"
import { HealthScoreCards } from "@/components/home/health-score-cards"
import { Timeline } from "@/components/home/timeline"

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <HomeHero />
      <div className="relative z-10 mt-2 pb-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <HealthScoreCards />
          <Timeline />
        </div>
      </div>
    </div>
  )
}

