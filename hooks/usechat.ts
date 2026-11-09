import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/components/AuthContext'

export interface FileAttachment {
  base64: string
  mimeType: string
  name: string
}

export function useChat() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const accountRef = useRef(user?.id)
  accountRef.current = user?.id
  const requestRef = useRef<AbortController | null>(null)
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    setMessages([])
    setConversationId(null)
    setLoading(false)
    return () => { generation.current += 1; requestRef.current?.abort() }
  }, [user?.id])

  const sendMessage = async (content: string, fileData?: FileAttachment) => {
    if (!user || requestRef.current || loading || (!content.trim() && !fileData)) return

    const controller = new AbortController()
    requestRef.current = controller
    const requestGeneration = generation.current
    const isCurrent = () => generation.current === requestGeneration && accountRef.current === user.id && !controller.signal.aborted
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 60_000)
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

        if (!isCurrent()) return
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

      if (!isCurrent()) return

      // Build conversation history for context (last 10 turns)
      const history = messages.filter(m => !m.isError).slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))

      const { data: { session } } = await supabase.auth.getSession()
      if (!isCurrent()) return
      if (!session?.access_token || session.user.id !== user.id) {
        throw new Error('Your session has expired. Sign in again to use your health guide.')
      }

      // Call AI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: content, fileData, conversationHistory: history }),
        signal: controller.signal,
      })

      const data = await response.json().catch(() => ({ error: 'The health guide returned an unreadable response. Please try again shortly.' }))

      if (!isCurrent()) return
      if (!response.ok) {
        throw new Error(data.error || `API error ${response.status}`)
      }

      if (!data.reply?.trim()) throw new Error('The health guide returned an empty response. Please try again.')

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
      // A cleared conversation or changed account must never receive an old reply.
      if (generation.current !== requestGeneration || accountRef.current !== user.id) return
      const msg = error instanceof TypeError
        ? 'Could not reach the health guide. Check your connection and try again.'
        : error instanceof Error ? error.message : 'The health guide could not respond. Please try again.'
      const isQuota = msg.toLowerCase().includes('429') || msg.toLowerCase().includes('rate')
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        isError: true,
        content: isQuota
          ? '⚠️ AI rate limit reached. Please wait a moment and try again.'
          : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'The health guide took too long to respond. Please try again.'
            : msg,
        created_at: new Date().toISOString(),
      }])
    } finally {
      clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  const clearChat = async () => {
    generation.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    setLoading(false)
    setMessages([])
    setConversationId(null)
  }

  return { messages, loading, sendMessage, clearChat, conversationId }
}
