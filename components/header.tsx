"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/AuthContext"
import { Menu, X } from "lucide-react"

const navItems = [
  { name: "Home", href: "/home" },
  { name: "Data", href: "/data" },
  { name: "Insights", href: "/insights" },
]

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.replace("/signin")
  }

  return (
    <header className="sticky top-0 z-50 w-full glass-darker">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/home" className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-tight text-cyan-400">healyx</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center">
          <div className="flex items-center rounded-full glass p-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-full transition-colors",
                  pathname === item.href
                    ? "bg-cyan-500/20 text-cyan-400 glow-cyan"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors hidden md:block"
          >
            Sign Out
          </button>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border glass-darker px-4 pb-4 pt-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block px-4 py-3 text-sm font-medium rounded-xl transition-colors",
                pathname === item.href
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {item.name}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => { setMobileOpen(false); handleSignOut() }}
            className="block w-full text-left px-4 py-3 text-sm font-medium text-red-400 hover:bg-white/5 rounded-xl transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  )
}
