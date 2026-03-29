import { useState, useEffect, useRef } from 'react'
import { Sparkles, X, Send, Zap, FileText, AlertTriangle, RefreshCw, Bot, User } from 'lucide-react'
import { useAIBriefing, useAIChat, useAIAction } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'

interface Message {
  id: string
  role: 'ai' | 'user'
  content: string
  timestamp: Date
}

const QUICK_ACTIONS = [
  { key: 'update-overdue', label: 'Update Overdue', icon: Zap, color: '#D97706' },
  { key: 'generate-wosr', label: 'Generate WOSR', icon: FileText, color: '#7C3AED' },
  { key: 'escalate', label: 'Escalate', icon: AlertTriangle, color: '#EB5757' },
  { key: 'sync-erp', label: 'Sync ERP', icon: RefreshCw, color: '#0F7B6C' },
]

export function AIPanel() {
  const toggleAIPanel = useAppStore((s) => s.toggleAIPanel)
  const { data: briefing } = useAIBriefing()
  const chatMutation = useAIChat()
  const actionMutation = useAIAction()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)
  const briefingLoaded = useRef(false)

  // Load briefing as first AI message
  useEffect(() => {
    if (briefing && !briefingLoaded.current) {
      briefingLoaded.current = true
      const content =
        typeof briefing === 'string'
          ? briefing
          : briefing.message ?? briefing.briefing ?? JSON.stringify(briefing)
      setMessages([
        {
          id: 'briefing',
          role: 'ai',
          content,
          timestamp: new Date(),
        },
      ])
    }
  }, [briefing])

  // Auto-scroll to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [messages])

  const addMessage = (role: 'ai' | 'user', content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, content, timestamp: new Date() },
    ])
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return

    addMessage('user', text)
    setInput('')

    chatMutation.mutate(
      {
        message: text,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onSuccess: (data) => {
          const response =
            typeof data === 'string'
              ? data
              : data?.message ?? data?.response ?? 'Understood.'
          addMessage('ai', response)
        },
        onError: () => {
          addMessage('ai', 'Sorry, I encountered an error. Please try again.')
        },
      }
    )
  }

  const handleAction = (actionKey: string) => {
    addMessage('user', `Action: ${actionKey}`)
    actionMutation.mutate(actionKey, {
      onSuccess: (data) => {
        const response =
          typeof data === 'string'
            ? data
            : data?.message ?? data?.result ?? `Action "${actionKey}" completed.`
        addMessage('ai', response)
      },
      onError: () => {
        addMessage('ai', `Failed to execute "${actionKey}". Please try again.`)
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="fixed top-0 right-0 h-full flex flex-col z-50"
      style={{
        width: 420,
        background: 'var(--bg-base)',
        borderLeft: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span
            className="text-sm font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-primary)' }}
          >
            NEXUS AI
          </span>
        </div>
        <button
          onClick={toggleAIPanel}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Actions */}
      <div
        className="grid grid-cols-2 gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.key}
              onClick={() => handleAction(action.key)}
              disabled={actionMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: `${action.color}12`,
                color: action.color,
                border: `1px solid ${action.color}20`,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {action.label}
            </button>
          )
        })}
      </div>

      {/* Message Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: msg.role === 'ai' ? 'var(--accent-light)' : 'var(--bg-surface)',
              }}
            >
              {msg.role === 'ai' ? (
                <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              ) : (
                <User className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
              )}
            </div>

            {/* Bubble */}
            <div
              className="max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed"
              style={{
                background: msg.role === 'ai' ? 'var(--bg-surface)' : 'var(--accent-light)',
                color: 'var(--text-primary)',
                border: msg.role === 'ai' ? '1px solid var(--border-default)' : '1px solid rgba(47, 128, 237, 0.15)',
                borderRadius: '10px',
                borderTopLeftRadius: msg.role === 'ai' ? '4px' : '10px',
                borderTopRightRadius: msg.role === 'user' ? '4px' : '10px',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent-light)' }}
            >
              <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            </div>
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-1.5"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)', animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)', animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask NEXUS AI..."
          className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || chatMutation.isPending}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
          style={{
            background: input.trim() ? 'var(--accent)' : 'var(--bg-surface)',
            opacity: input.trim() ? 1 : 0.5,
          }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  )
}
