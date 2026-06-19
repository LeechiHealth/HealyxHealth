"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowRight } from "lucide-react"

export function SigninForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Sign in using THE shared client
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      if (data?.user) {
        // Success - redirect to home
        router.push("/home")
      }
    } catch (err: any) {
      setError(err.message || "An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <a href="/signin" className="mb-8">
        <span className="text-2xl font-semibold tracking-tight text-cyan-400">healyx</span>
      </a>

      {/* Form Card */}
      <div className="w-full max-w-lg glass rounded-2xl p-8 border border-cyan-500/20">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Sign in to your account</h2>
            <p className="text-sm text-muted-foreground">Welcome back to Healyx Health</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={loading}
              className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={loading}
              className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 glow-cyan"
          >
            {loading ? "Signing in..." : "Sign In"}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </form>
      </div>

      {/* Sign up link */}
      <p className="mt-6 text-sm text-muted-foreground">
        Need an account?{" "}
        <a href="/signup" className="text-cyan-400 hover:text-cyan-300 transition-colors">
          Sign Up
        </a>
      </p>

    </div>
  )
}