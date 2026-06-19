import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/components/AuthContext'

export interface FileAttachment {
  base64: string
  mimeType: string
  name: string
}

// Build a compact, personalized health summary so the AI actually knows the user.
async function buildHealthContext(userId: string, email?: string | null): Promise<string> {
  try {
    const [profileRes, condRes, medRes, bioRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, date_of_birth, gender, height_inches, weight_lbs, blood_type')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('conditions').select('name, status, severity').eq('user_id', userId).limit(40),
      supabase.from('medications').select('name, dosage, frequency').eq('user_id', userId).limit(40),
      supabase
        .from('biomarkers')
        .select('name, value, unit, status, test_date')
        .eq('user_id', userId)
        .order('test_date', { ascending: false })
        .limit(40),
    ])

    const p: any = profileRes.data
    const lines: string[] = []

    const person: string[] = []
    if (p?.full_name) person.push(p.full_name)
    if (p?.gender) person.push(p.gender)
    if (p?.date_of_birth) {
      const age = Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000)
      if (age > 0 && age < 130) person.push(`${age}y`)
    }
    if (p?.height_inches) person.push(`${Math.floor(p.height_inches / 12)}'${Math.round(p.height_inches % 12)}"`)
    if (p?.weight_lbs) person.push(`${p.weight_lbs} lbs`)
    if (p?.blood_type) person.push(`blood type ${p.blood_type}`)
    if (person.length) lines.push(`Profile: ${person.join(', ')}.`)

    const conds = (condRes.data || []) as any[]
    if (conds.length) {
      lines.push('Conditions: ' + conds.map(c => `${c.name}${c.status ? ` (${c.status})` : ''}`).join('; ') + '.')
    }

    const meds = (medRes.data || []) as any[]
    if (meds.length) {
      lines.push('Medications: ' + meds.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? `, ${m.frequency}` : ''}`).join('; ') + '.')
    }

    const bios = (bioRes.data || []) as any[]
    if (bios.length) {
      const flagged = bios.filter(b => b.status && !['optimal', 'normal'].includes(b.status))
      const show = (flagged.length ? flagged : bios).slice(0, 20)
      lines.push('Recent lab results' + (flagged.length ? ' (flagged first)' : '') + ': ' +
        show.map(b => `${b.name} ${b.value}${b.unit ? ` ${b.unit}` : ''}${b.status ? ` [${b.status}]` : ''}`).join('; ') + '.')
    }

    if (!lines.length) return ''
    return `The user you are speaking with has the following health record on file. Use it to personalize every answer and refer to it directly when asked about "my" profile, conditions, medications, or labs:\n${lines.join('\n')}`
  } catch {
    return ''
  }
}

export function useChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const sendMessage = async (content: string, fileData?: FileAttachment) => {
    if (!user || (!content.trim() && !fileData)) return

    setLoading(true)

    const displayContent = content.trim() || (fileData ? `📎 ${fileData.name}` : '')

    try {
      // Create conversation if first message
      let convId = conversationId
      if (!convId) {
        const { data: conv, error: convError } = await supabase
          .from('chat_conversations')
          .insert({ user_id: user.id, title: displayContent.substring(0, 50) })
          .select()
          .single()

        if (convError) {
          console.error('Failed to create conversation:', convError)
        } else if (conv) {
          convId = conv.id
          setConversationId(convId)
        }
      }

      // Add user message to UI immediately
      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: displayContent,
        fileName: fileData?.name,
        image: fileData && fileData.mimeType.startsWith('image/')
          ? `data:${fileData.mimeType};base64,${fileData.base64}`
          : undefined,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMsg])

      // Save user message to DB
      if (convId) {
        await supabase.from('chat_messages').insert({
          conversation_id: convId,
          user_id: user.id,
          role: 'user',
          content: displayContent,
        })
      }

      // Build conversation history for context (last 10 turns)
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))

      // Pull the user's personalized health record so the AI can speak to it
      const healthContext = await buildHealthContext(user.id, user.email)

      // Call AI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, fileData, conversationHistory: history, healthContext }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `API error ${response.status}`)
      }

      if (data.reply) {
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply,
          created_at: new Date().toISOString(),
        }
        setMessages(prev => [...prev, aiMsg])

        if (convId) {
          await supabase.from('chat_messages').insert({
            conversation_id: convId,
            user_id: user.id,
            role: 'assistant',
            content: data.reply,
          })
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      const msg = error instanceof Error ? error.message : 'Unknown error'
      const isQuota = msg.toLowerCase().includes('429') || msg.toLowerCase().includes('rate')
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: isQuota
          ? '⚠️ AI rate limit reached. Please wait a moment and try again.'
          : `Sorry, something went wrong: ${msg}. Please try again.`,
        created_at: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = async () => {
    setMessages([])
    setConversationId(null)
  }

  return { messages, loading, sendMessage, clearChat, conversationId }
}
