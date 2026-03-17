import { useState } from 'react'
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

      // Call AI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, fileData, conversationHistory: history }),
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
