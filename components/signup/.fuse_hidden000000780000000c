"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react"

const TOTAL_STEPS = 4

const conditionOptions = [
  "Diabetes",
  "Heart Disease",
  "High Blood Pressure",
  "Asthma",
  "High Cholesterol",
  "Thyroid Disorder",
  "Anxiety/Depression",
  "None",
]

const exerciseOptions = [
  "Cardio",
  "Strength Training",
  "Yoga/Flexibility",
  "Sports",
  "Walking",
  "None",
]

export function SignupForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [emailSent, setEmailSent] = useState(false)

  // Step 1: Account
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  // Step 2: Demographics
  const [heightFeet, setHeightFeet] = useState("")
  const [heightInches, setHeightInches] = useState("")
  const [weight, setWeight] = useState("")
  const [dob, setDob] = useState("")
  const [sex, setSex] = useState("")
  const [race, setRace] = useState("")

  // Step 3: Health History
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])
  const [takingMeds, setTakingMeds] = useState<"yes" | "no" | "">("")
  const [medsText, setMedsText] = useState("")
  const [fitnessLevel, setFitnessLevel] = useState("")
  const [exerciseDays, setExerciseDays] = useState([3])
  const [exerciseTypes, setExerciseTypes] = useState<string[]>([])

  function toggleChip(value: string, list: string[], setList: (v: string[]) => void) {
    if (value === "None") {
      setList(list.includes("None") ? [] : ["None"])
      return
    }
    const without = list.filter((v) => v !== "None")
    if (without.includes(value)) {
      setList(without.filter((v) => v !== value))
    } else {
      setList([...without, value])
    }
  }

  function validateStep1(): string {
    if (!firstName.trim()) return "First name is required."
    if (!email.trim()) return "Email is required."
    if (password.length < 8) return "Password must be at least 8 characters."
    if (password !== confirmPassword) return "Passwords do not match."
    return ""
  }

  function nextStep() {
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
    }
    setError("")
    if (step < TOTAL_STEPS) setStep(step + 1)
  }

  function prevStep() {
    setError("")
    if (step > 1) setStep(step - 1)
  }

  // Convert feet + inches → total inches
  function toTotalInches(feet: string, inches: string): number | null {
    const ft = parseFloat(feet)
    const ins = parseFloat(inches || "0")
    if (isNaN(ft)) return null
    return ft * 12 + ins
  }

  // Total inches → cm
  function inchesToCm(totalInches: number): number {
    return Math.round(totalInches * 2.54)
  }

  // BMI formula: (weight_lbs / (height_inches^2)) × 703
  function calcBMI(weightLbs: number, heightInches: number): number | null {
    if (!weightLbs || !heightInches) return null
    return Math.round((weightLbs / (heightInches * heightInches)) * 703 * 10) / 10
  }

  async function handleGetStarted() {
    setLoading(true)
    setError("")

    try {
      // 1. Create the Supabase auth user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      const userId = data.user?.id
      if (!userId) {
        setError("Signup failed — no user ID returned. Please try again.")
        setLoading(false)
        return
      }

      // 2. Upsert profile row with all onboarding data (imperial)
      const totalInches = toTotalInches(heightFeet, heightInches)
      const weightLbsNum = weight ? parseFloat(weight) : null
      const bmi = totalInches && weightLbsNum ? calcBMI(weightLbsNum, totalInches) : null

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        email: email.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        date_of_birth: dob || null,
        gender: sex || null,
        height_inches: totalInches,
        height_cm: totalInches ? inchesToCm(totalInches) : null,
        weight_lbs: weightLbsNum,
      })

      if (profileError) {
        console.error("Profile insert error:", profileError.message)
      }

      // 3. Seed initial vitals row from onboarding weight
      if (userId && weightLbsNum) {
        const weightKg = Math.round(weightLbsNum * 0.453592 * 10) / 10
        await supabase.from("vitals").insert({
          user_id: userId,
          weight_kg: weightKg,
          bmi: bmi,
          source: "onboarding",
          recorded_at: new Date().toISOString(),
          notes: "From signup onboarding",
        })
      }

      // 4. Redirect or show email confirmation notice
      if (data.session) {
        router.push("/home")
      } else {
        setEmailSent(true)
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // ── Email confirmation screen ──────────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
        <a href="/signin" className="mb-8">
          <span className="text-2xl font-semibold tracking-tight text-cyan-400">healyx</span>
        </a>
        <div className="w-full max-w-lg glass rounded-2xl p-8 border border-cyan-500/20 text-center space-y-6">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-cyan-500/20 border border-cyan-500/30 glow-cyan">
            <Mail className="h-8 w-8 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <span className="text-cyan-400">{email}</span>.
              Click it to activate your account, then sign in.
            </p>
          </div>
          <Button
            onClick={() => router.push("/signin")}
            className="w-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 glow-cyan"
          >
            Go to Sign In
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Main signup flow ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <a href="/" className="mb-8">
        <span className="text-2xl font-semibold tracking-tight text-cyan-400">healyx</span>
      </a>

      {/* Progress Bar */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i + 1 <= step ? "bg-cyan-400 w-10" : "bg-secondary w-6"
            )}
          />
        ))}
      </div>

      {/* Form Card */}
      <div className="w-full max-w-lg glass rounded-2xl p-8 border border-cyan-500/20">

        {/* Global error banner */}
        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Account Creation */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Create your account</h2>
              <p className="text-sm text-muted-foreground">Get started with Healyx Health</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="firstName" className="text-foreground">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="lastName" className="text-foreground">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
                placeholder="At least 8 characters"
                className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
              />
            </div>
          </div>
        )}

        {/* Step 2: Health Demographics */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Health demographics</h2>
              <p className="text-sm text-muted-foreground">Help us personalize your experience</p>
            </div>

            {/* Height */}
            <div className="space-y-2">
              <Label className="text-foreground">Height</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Select value={heightFeet} onValueChange={setHeightFeet}>
                    <SelectTrigger className="bg-secondary border-border focus:border-cyan-500/50 text-foreground">
                      <SelectValue placeholder="Feet" />
                    </SelectTrigger>
                    <SelectContent className="glass border-border">
                      {[3, 4, 5, 6, 7].map((ft) => (
                        <SelectItem key={ft} value={String(ft)}>
                          {ft} ft
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Select value={heightInches} onValueChange={setHeightInches}>
                    <SelectTrigger className="bg-secondary border-border focus:border-cyan-500/50 text-foreground">
                      <SelectValue placeholder="Inches" />
                    </SelectTrigger>
                    <SelectContent className="glass border-border">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i} in
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <Label htmlFor="weight" className="text-foreground">Weight (lbs)</Label>
              <Input
                id="weight"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 160"
                className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dob" className="text-foreground">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground"
              />
            </div>

            {/* Sex */}
            <div className="space-y-2">
              <Label className="text-foreground">Sex assigned at birth</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger className="bg-secondary border-border focus:border-cyan-500/50 text-foreground">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="glass border-border">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Race/Ethnicity */}
            <div className="space-y-2">
              <Label className="text-foreground">Race / Ethnicity</Label>
              <Select value={race} onValueChange={setRace}>
                <SelectTrigger className="bg-secondary border-border focus:border-cyan-500/50 text-foreground">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="glass border-border">
                  <SelectItem value="white">White</SelectItem>
                  <SelectItem value="black">Black / African American</SelectItem>
                  <SelectItem value="hispanic">Hispanic / Latino</SelectItem>
                  <SelectItem value="asian">Asian</SelectItem>
                  <SelectItem value="native-american">Native American</SelectItem>
                  <SelectItem value="pacific-islander">Pacific Islander</SelectItem>
                  <SelectItem value="mixed">Mixed / Multiracial</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 3: Health History & Activity */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Health history & activity</h2>
              <p className="text-sm text-muted-foreground">A few quick questions about your health</p>
            </div>

            {/* Conditions */}
            <div className="space-y-3">
              <Label className="text-foreground">Do you have any diagnosed medical conditions?</Label>
              <div className="flex flex-wrap gap-2">
                {conditionOptions.map((condition) => (
                  <button
                    key={condition}
                    onClick={() => toggleChip(condition, selectedConditions, setSelectedConditions)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-full border transition-colors",
                      selectedConditions.includes(condition)
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                        : "bg-secondary text-muted-foreground border-border hover:border-cyan-500/30 hover:text-foreground"
                    )}
                  >
                    {condition}
                  </button>
                ))}
              </div>
            </div>

            {/* Taking Medications */}
            <div className="space-y-3">
              <Label className="text-foreground">Are you currently taking any medications?</Label>
              <div className="flex gap-3">
                <button
                  onClick={() => setTakingMeds("yes")}
                  className={cn(
                    "px-4 py-2 text-sm rounded-full border transition-colors",
                    takingMeds === "yes"
                      ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                      : "bg-secondary text-muted-foreground border-border hover:border-cyan-500/30"
                  )}
                >
                  Yes
                </button>
                <button
                  onClick={() => { setTakingMeds("no"); setMedsText("") }}
                  className={cn(
                    "px-4 py-2 text-sm rounded-full border transition-colors",
                    takingMeds === "no"
                      ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                      : "bg-secondary text-muted-foreground border-border hover:border-cyan-500/30"
                  )}
                >
                  No
                </button>
              </div>
              {takingMeds === "yes" && (
                <Textarea
                  value={medsText}
                  onChange={(e) => setMedsText(e.target.value)}
                  placeholder="List your current medications..."
                  className="bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground placeholder:text-muted-foreground min-h-[80px]"
                />
              )}
            </div>

            {/* Fitness Level */}
            <div className="space-y-3">
              <Label className="text-foreground">How would you rate your current fitness level?</Label>
              <div className="flex flex-wrap gap-2">
                {["Sedentary", "Lightly Active", "Moderately Active", "Very Active", "Extremely Active"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setFitnessLevel(level)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-full border transition-colors",
                      fitnessLevel === level
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                        : "bg-secondary text-muted-foreground border-border hover:border-cyan-500/30 hover:text-foreground"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Exercise Days */}
            <div className="space-y-3">
              <Label className="text-foreground">
                On average, how many days per week do you exercise?
                <span className="ml-2 text-cyan-400 font-medium">{exerciseDays[0]}</span>
              </Label>
              <Slider
                value={exerciseDays}
                onValueChange={setExerciseDays}
                max={7}
                min={0}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>7</span>
              </div>
            </div>

            {/* Exercise Types */}
            <div className="space-y-3">
              <Label className="text-foreground">What types of exercise do you typically do?</Label>
              <div className="flex flex-wrap gap-2">
                {exerciseOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleChip(type, exerciseTypes, setExerciseTypes)}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-full border transition-colors",
                      exerciseTypes.includes(type)
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                        : "bg-secondary text-muted-foreground border-border hover:border-cyan-500/30 hover:text-foreground"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Submit */}
        {step === 4 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-cyan-500/20 border border-cyan-500/30 glow-cyan">
              <Check className="h-8 w-8 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Ready to go, {firstName || "there"}!
              </h2>
              <p className="text-sm text-muted-foreground">
                Review your profile and hit <strong className="text-cyan-400">Create Account</strong> to get started.
              </p>
            </div>

            {/* Summary */}
            <div className="glass rounded-xl p-5 border border-cyan-500/20 text-left space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Profile Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {firstName && (
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p className="text-foreground">{firstName} {lastName}</p>
                  </div>
                )}
                {email && (
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <p className="text-foreground truncate">{email}</p>
                  </div>
                )}
                {heightFeet && (
                  <div>
                    <span className="text-muted-foreground">Height</span>
                    <p className="text-foreground">{heightFeet}&apos;{heightInches}&quot;</p>
                  </div>
                )}
                {weight && (
                  <div>
                    <span className="text-muted-foreground">Weight</span>
                    <p className="text-foreground">{weight} lbs</p>
                  </div>
                )}
                {fitnessLevel && (
                  <div>
                    <span className="text-muted-foreground">Fitness Level</span>
                    <p className="text-foreground">{fitnessLevel}</p>
                  </div>
                )}
                {exerciseDays[0] > 0 && (
                  <div>
                    <span className="text-muted-foreground">Exercise Days/Week</span>
                    <p className="text-foreground">{exerciseDays[0]}</p>
                  </div>
                )}
              </div>
              {selectedConditions.length > 0 && !selectedConditions.includes("None") && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Conditions</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedConditions.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          {step > 1 ? (
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <Button
              onClick={nextStep}
              disabled={loading}
              className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 glow-cyan"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleGetStarted}
              disabled={loading}
              className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 glow-cyan"
            >
              {loading ? "Creating account…" : "Create Account"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* Sign in link */}
      {step === 1 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/signin" className="text-cyan-400 hover:text-cyan-300 transition-colors">
            Sign in
          </a>
        </p>
      )}
    </div>
  )
}
