"use client"

import * as React from "react"
import type { AgentId } from "@/lib/agents/config"
import { cn } from "@/lib/utils"

// Original character avatars: a simple shape per agent with two eyes.
const PALETTE: Record<AgentId, { from: string; to: string }> = {
  appointments: { from: "#b79bff", to: "#7c4dff" },
  medications: { from: "#7cc4ff", to: "#2f7cf6" },
  research: { from: "#7ee2a0", to: "#1fb45a" },
  shopping: { from: "#ffb46b", to: "#f26b1d" },
}

function Eyes({ x, y, tilt = 0 }: { x: number; y: number; tilt?: number }) {
  return (
    <g transform={`rotate(${tilt} ${x + 4} ${y})`} fill="#fff">
      <rect x={x} y={y - 4} width={3.6} height={8} rx={1.8} />
      <rect x={x + 7} y={y - 5} width={3.6} height={8} rx={1.8} />
    </g>
  )
}

function Shape({ agent, gradientId }: { agent: AgentId; gradientId: string }) {
  const fill = `url(#${gradientId})`
  switch (agent) {
    case "appointments":
      return <><circle cx="24" cy="24" r="21" fill={fill} /><Eyes x={24} y={17} tilt={10} /></>
    case "medications":
      return (
        <g transform="rotate(-35 24 24)">
          <rect x="4" y="13" width="40" height="22" rx="11" fill={fill} />
          <path d="M24 13h9a11 11 0 0 1 0 22h-9z" fill="#fff" fillOpacity="0.28" />
          <g transform="rotate(35 24 24)"><Eyes x={21} y={21} tilt={-6} /></g>
        </g>
      )
    case "research":
      return (
        <>
          <path d="M14 38c-6 0-10-4.4-10-9.6 0-4.7 3.4-8.6 7.9-9.4C13 12.6 18 8 24.2 8c5.4 0 10 3.5 11.7 8.4C40.8 17 44 21.2 44 26.4 44 32.8 39.4 38 33.4 38z" fill={fill} />
          <Eyes x={22} y={22} tilt={8} />
        </>
      )
    case "shopping":
      return (
        <>
          <path d="M17 15a7 7 0 0 1 14 0" fill="none" stroke={PALETTE.shopping.to} strokeWidth="3.2" strokeLinecap="round" />
          <rect x="7" y="14" width="34" height="29" rx="10" fill={fill} />
          <Eyes x={21} y={27} tilt={-8} />
        </>
      )
  }
}

export function AgentAvatar({ agent, size = 40, className }: { agent: AgentId; size?: number; className?: string }) {
  const { from, to } = PALETTE[agent]
  // Unique per instance: a duplicate id inside a hidden pane would blank every avatar after it.
  const gradientId = `agent-grad-${agent}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0.15" y1="0.05" x2="0.85" y2="0.95">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <Shape agent={agent} gradientId={gradientId} />
    </svg>
  )
}

export const AGENT_ACCENTS: Record<AgentId, string> = {
  appointments: PALETTE.appointments.to,
  medications: PALETTE.medications.to,
  research: PALETTE.research.to,
  shopping: PALETTE.shopping.to,
}
