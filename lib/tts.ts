// Helpers for the /api/tts route (kept out of route.ts so Next.js only sees handlers).

export const DEFAULT_VOICE = 'Sulafat' // Gemini's "warm" voice
export const VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])
export const STYLE = 'warm, friendly and relaxed, like a caring friend talking naturally, unhurried, gently upbeat'
export const MAX_CHARS = 1200
export const SAMPLE_RATE = 24000

// Best-effort per-account limit (per server instance): 40 requests a minute.
const WINDOW_MS = 60_000
const LIMIT = 40
const recent = new Map<string, number[]>()
export function allowRequest(userId: string, now = Date.now()): boolean {
  const kept = (recent.get(userId) || []).filter(t => now - t < WINDOW_MS)
  if (kept.length >= LIMIT) { recent.set(userId, kept); return false }
  kept.push(now)
  recent.set(userId, kept)
  return true
}

/** Wraps raw 16-bit little-endian mono PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** Finds the first base64 audio payload anywhere in a Gemini response. */
export function findAudio(value: unknown): { data: string; mimeType: string } | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) { const found = findAudio(item); if (found) return found }
    return null
  }
  const record = value as Record<string, unknown>
  const mimeType = String(record.mime_type ?? record.mimeType ?? '')
  if (typeof record.data === 'string' && record.data.length > 100 && (mimeType.startsWith('audio') || record.type === 'audio')) {
    return { data: record.data, mimeType: mimeType || 'audio/l16' }
  }
  for (const child of Object.values(record)) { const found = findAudio(child); if (found) return found }
  return null
}

/** Accepts WAV as-is; wraps raw PCM (audio/l16, audio/pcm) in a WAV header. */
export function toWav(audio: { data: string; mimeType: string }): Buffer {
  const bytes = Buffer.from(audio.data, 'base64')
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF') return bytes
  const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1]) || SAMPLE_RATE
  return pcmToWav(bytes, rate)
}

