"use client"

import * as React from "react"
import { Plus, ArrowUp, Paperclip, Mic, MicOff, Menu, X, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Header } from "@/components/header"
import { useChat, FileAttachment } from "@/hooks/usechat"
import { useAuth } from "@/components/AuthContext"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { ChatSidebar } from "@/components/home/chat-sidebar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function HomeHero() {
  const { user } = useAuth()
  const { messages, loading, sendMessage, clearChat } = useChat()

  const [input, setInput] = React.useState("")
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  // File attachment state
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [attachedFile, setAttachedFile] = React.useState<FileAttachment | null>(null)
  const [fileError, setFileError] = React.useState<string | null>(null)

  // Recording state
  const [isRecording, setIsRecording] = React.useState(false)
  const [isTranscribing, setIsTranscribing] = React.useState(false)
  const [transcript, setTranscript] = React.useState("")
  const [recordingError, setRecordingError] = React.useState<string | null>(null)
  const [visitSaved, setVisitSaved] = React.useState(false)
  const [savingVisit, setSavingVisit] = React.useState(false)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const audioChunksRef = React.useRef<Blob[]>([])

  // ── File handling ───────────────────────────────────────────────────────────

  const ACCEPTED_TYPES = [
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    "application/pdf",
  ]
  const MAX_SIZE_MB = 10

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError("Unsupported file type. Please upload a PDF or image (JPG, PNG, HEIC).")
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`File too large. Max ${MAX_SIZE_MB}MB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      const base64 = dataUrl.split(",")[1]
      setAttachedFile({ base64, mimeType: file.type, name: file.name })
      setIsMenuOpen(false)
    }
    reader.onerror = () => {
      setFileError("Failed to read file. Please try again.")
    }
    reader.readAsDataURL(file)

    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  const clearAttachment = () => {
    setAttachedFile(null)
    setFileError(null)
  }

  // ── Send message ────────────────────────────────────────────────────────────

  const handleSend = () => {
    if ((!input.trim() && !attachedFile) || loading) return
    sendMessage(input, attachedFile ?? undefined)
    setInput("")
    setAttachedFile(null)
  }

  // ── Voice recording (MediaRecorder → Groq Whisper) ──────────────────────────

  const handleRecordToggle = async () => {
    if (isRecording) {
      // Only call stop() here — do NOT kill the stream yet.
      // Killing the stream immediately cuts off the final audio chunk before onstop fires.
      // The stream tracks are stopped inside onstop after all data is collected.
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      return
    }

    setTranscript("")
    setRecordingError(null)
    setVisitSaved(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })

      // Pick best supported format (Groq Whisper accepts webm, mp4, wav)
      const actualMimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''

      const recorder = actualMimeType
        ? new MediaRecorder(stream, { mimeType: actualMimeType })
        : new MediaRecorder(stream)
      const blobMimeType = actualMimeType || recorder.mimeType || 'audio/webm'
      audioChunksRef.current = []
      const startTime = Date.now()

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // NOW it's safe to release the mic — all data has been collected
        stream.getTracks().forEach(t => t.stop())

        const durationMs = Date.now() - startTime
        const blob = new Blob(audioChunksRef.current, { type: blobMimeType })

        if (durationMs < 2000 || blob.size < 3000) {
          setRecordingError("Recording too short — please speak for at least 3 seconds.")
          return
        }

        setIsTranscribing(true)
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64, mimeType: blobMimeType }),
          })
          const data = await res.json()
          if (res.ok && data.transcript && data.transcript.trim().length > 1) {
            setTranscript(data.transcript)
          } else if (res.ok) {
            setRecordingError("Could not detect speech — please speak clearly and try again.")
          } else {
            setRecordingError(data.error || "Transcription failed. Please try again.")
          }
        } catch {
          setRecordingError("Transcription failed. Please try again.")
        } finally {
          setIsTranscribing(false)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start(500) // collect chunks every 500ms for reliable capture
      setIsRecording(true)
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? "Microphone access denied. Please allow microphone access in your browser settings."
        : err?.message || "Could not start recording."
      setRecordingError(msg)
    }
  }

  const handleSaveVisitNote = async () => {
    if (!transcript.trim()) return
    setSavingVisit(true)
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })
      if (res.ok) {
        setVisitSaved(true)
        setTranscript("")
        toast.success("Visit note saved!")
        setTimeout(() => {
          setVisitSaved(false)
          setIsMenuOpen(false)
        }, 2000)
      } else {
        const errData = await res.json().catch(() => ({}))
        const msg = errData?.error || "Failed to save visit note. Please try again."
        setRecordingError(msg)
        toast.error(msg)
      }
    } catch {
      setRecordingError("Failed to save visit note. Please try again.")
      toast.error("Failed to save visit note.")
    } finally {
      setSavingVisit(false)
    }
  }

  React.useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Chat history sidebar */}
      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent className="sm:max-w-md h-[600px] p-0">
          <DialogTitle className="sr-only">Chat history</DialogTitle>
          <ChatSidebar
            onClearChat={() => { clearChat(); setSidebarOpen(false) }}
            messageCount={messages.length}
            messages={messages}
          />
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="relative min-h-[480px] w-full overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('/images/hero-mountains.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/30 to-background" />
        </div>

        {/* Header */}
        <div className="relative z-20">
          <div className="flex items-center px-6 py-4">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="text-muted-foreground hover:text-cyan-400 mr-4"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <div className="flex-1">
              <Header />
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 px-4 sm:px-6 pt-8 pb-8">
          <div className="mx-auto max-w-5xl flex flex-col items-center">

            {messages.length === 0 && (
              <div className="text-center mb-8">
                <h1 className="text-foreground text-3xl sm:text-4xl font-light mt-1 text-balance">
                  Your health, <span className="text-gradient-cyan">understood.</span>
                </h1>
                <p className="text-muted-foreground mt-3 max-w-xl text-base leading-relaxed">
                  Ask about your health, record visits, upload any lab result. Get AI-powered explanations. Track your biomarker trends over time.
                </p>
              </div>
            )}

            {/* Chat Interface */}
            <div className="w-full flex justify-center">
              <div className="w-full max-w-2xl">

                {/* Messages */}
                {messages.length > 0 && (
                  <div className="mb-4 space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                            msg.role === "user"
                              ? "bg-cyan-500/10 text-foreground border border-cyan-500/20"
                              : "glass border border-border"
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex justify-start">
                        <div className="glass border border-border rounded-2xl px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* File attachment preview */}
                {attachedFile && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <Paperclip className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="text-xs text-cyan-300 truncate flex-1">{attachedFile.name}</span>
                    <button onClick={clearAttachment} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {fileError && (
                  <p className="mb-2 text-xs text-destructive px-1">{fileError}</p>
                )}

                {/* Input bar */}
                <div className="relative">
                  <Input
                    placeholder={attachedFile ? "Add a message or send file directly…" : "Ask anything about your health…"}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) handleSend()
                    }}
                    disabled={loading}
                    className="h-12 pr-20 rounded-full bg-secondary border-border focus:border-cyan-500/50 focus:ring-cyan-500/20 text-foreground placeholder:text-muted-foreground"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">

                    {/* + menu */}
                    <Dialog open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-cyan-400">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-full max-w-xs p-4">
                        <DialogHeader>
                          <DialogTitle className="text-sm font-medium">Options</DialogTitle>
                        </DialogHeader>

                        <div className="mt-2 space-y-1">

                          {/* Add files */}
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 text-sm"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Paperclip className="h-4 w-4" />
                            Add files
                            <span className="ml-auto text-[10px] text-muted-foreground/50">PDF, JPG, PNG, HEIC</span>
                          </Button>

                          <div className="border-t border-border pt-2 mt-2">

                            {/* Record a visit */}
                            <Button
                              variant="ghost"
                              className={`w-full justify-start gap-2 text-sm ${isRecording ? "text-red-400 hover:text-red-300" : ""}`}
                              onClick={handleRecordToggle}
                              disabled={isTranscribing}
                            >
                              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                              {isTranscribing ? "Transcribing…" : isRecording ? "Stop recording" : "Record a visit"}
                              {isRecording && (
                                <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                  Live
                                </span>
                              )}
                              {isTranscribing && (
                                <span className="ml-auto text-[10px] text-cyan-400 animate-pulse">AI transcribing…</span>
                              )}
                            </Button>

                            {/* Transcript preview + save */}
                            {transcript && !isRecording && !isTranscribing && (
                              <div className="mt-3 px-1">
                                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 mb-3">
                                  {transcript}
                                </p>
                                {visitSaved ? (
                                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Visit note saved
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold"
                                    onClick={handleSaveVisitNote}
                                    disabled={savingVisit}
                                  >
                                    {savingVisit ? "Saving…" : "Save as visit note"}
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Live transcript preview while recording */}
                            {isRecording && transcript && (
                              <p className="mt-2 px-1 text-xs text-muted-foreground line-clamp-2 italic">
                                {transcript}
                              </p>
                            )}

                            {recordingError && (
                              <p className="mt-2 px-1 text-xs text-destructive">{recordingError}</p>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Send button */}
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={loading || (!input.trim() && !attachedFile)}
                      className="h-8 w-8 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 glow-cyan disabled:opacity-50"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
