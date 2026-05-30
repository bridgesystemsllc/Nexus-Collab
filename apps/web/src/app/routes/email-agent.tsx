import { Bot, Mail, Send, Sparkles } from 'lucide-react'

const queues = [
  { label: 'Vendor Follow-ups', count: 4, detail: 'MOQ, lead time, PO confirmations' },
  { label: 'Customer Updates', count: 3, detail: 'Inventory risk and launch timing' },
  { label: 'Internal Nudges', count: 6, detail: 'Approvals, artwork, formula handoffs' },
]

export function EmailAgentPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent-subtle)] text-[var(--accent)]">
          <Bot size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Email Agent</h1>
          <p className="text-sm text-[var(--text-tertiary)]">Draft, classify, and route operational email work</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {queues.map((queue) => (
          <div key={queue.label} className="data-cell space-y-3">
            <div className="flex items-center justify-between">
              <Mail size={18} className="text-[var(--accent)]" />
              <span className="text-2xl font-semibold tabular-nums">{queue.count}</span>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">{queue.label}</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">{queue.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="data-cell flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-[var(--accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Suggested action</p>
            <p className="text-sm text-[var(--text-secondary)]">Prepare vendor follow-up drafts for blocked launch components.</p>
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Send size={15} />
          Draft
        </button>
      </div>
    </div>
  )
}
