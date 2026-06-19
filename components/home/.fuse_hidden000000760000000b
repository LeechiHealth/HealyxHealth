"use client"

import * as React from "react"
import { MessageCircle, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ChatSidebarProps {
  onClearChat: () => void
  messageCount: number
  messages: ChatMessage[]
}

export function ChatSidebar({ onClearChat, messageCount, messages }: ChatSidebarProps) {
  // Get first user message as preview
  const firstMessage = messages.find(m => m.role === 'user')?.content || "New conversation"
  const preview = firstMessage.length > 40 ? firstMessage.slice(0, 40) + "..." : firstMessage

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
        <MessageCircle className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-foreground">Chat</h2>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-6 py-4">
        {/* New Chat Button */}
        <Button
          onClick={onClearChat}
          className="w-full mb-6 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 justify-start gap-2"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>

        {/* Current Conversation */}
        {messageCount > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">Current</div>
            <div className="bg-secondary/50 rounded-lg p-4 border border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium mb-1 truncate">{preview}</p>
                  <p className="text-xs text-muted-foreground">{messageCount} messages</p>
                </div>
                <button
                  onClick={onClearChat}
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {messageCount === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}