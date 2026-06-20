"use client"

import { HomeHero } from "@/components/home/home-hero"
import { HealthSnapshot } from "@/components/home/health-snapshot"
import { WellbeingCheckin } from "@/components/home/wellbeing-checkin"
import { Timeline } from "@/components/home/timeline"

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <HomeHero />
      <div className="relative z-10 mt-2 pb-24 md:pb-12">
        <div className="mx-auto max-w-3xl lg:max-w-5xl px-4 sm:px-6 lg:px-8">
          <HealthSnapshot />
          <WellbeingCheckin />
          <Timeline />
        </div>
      </div>
    </div>
  )
}

