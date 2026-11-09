"use client"

import * as React from "react"
import { supabase } from "@/lib/supabase/client"

type VoiceState = "idle" | "recording" | "transcribing"

/** Records from the microphone and returns a transcript through /api/transcribe (Groq Whisper). */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [state, setState] = React.useState<VoiceState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])

  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : ""
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const blobType = mimeType || recorder.mimeType || "audio/webm"
      const startedAt = Date.now()
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(chunksRef.current, { type: blobType })
        if (Date.now() - startedAt < 1200 || blob.size < 2000) { setState("idle"); setError("That was too short. Hold the mic a little longer."); return }
        setState("transcribing")
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result).split(",")[1])
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          const { data: { session } } = await supabase.auth.getSession()
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify({ base64, mimeType: blobType }),
          })
          const data = await response.json().catch(() => ({}))
          if (response.ok && data.transcript?.trim()) onTranscript(data.transcript.trim())
          else setError(response.ok ? "No speech detected. Try again." : data.error || "Transcription failed. Try again.")
        } catch {
          setError("Transcription failed. Try again.")
        } finally {
          setState("idle")
        }
      }
      recorderRef.current = recorder
      recorder.start(500)
      setState("recording")
    } catch (e: unknown) {
      setError((e as { name?: string })?.name === "NotAllowedError" ? "Microphone access is blocked. Allow it in your browser settings." : "Couldn't start the microphone.")
    }
  }

  function toggle() {
    if (state === "recording") recorderRef.current?.stop()
    else if (state === "idle") start()
  }

  return { state, error, supported, toggle, clearError: () => setError(null) }
}
