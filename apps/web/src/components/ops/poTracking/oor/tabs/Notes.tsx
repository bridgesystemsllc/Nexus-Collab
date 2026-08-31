// ─── Notes ──────────────────────────────────────────────────
// Reference material, deliberately distinct from Comments. A comment says what
// happened this week; a note says what is true about this line until someone
// changes it — the carton it uses, the customer's labelling rule.

import { Loader2, Pin } from 'lucide-react'
import { useOorCollection, useOorMutations } from '../useOorQueries'
import { ThreadComposer } from '../ThreadComposer'
import { Pill } from '../OorPills'
import { formatLongDate } from '../oorFormat'

interface Note {
  id: string
  title: string
  body: string
  category: string | null
  isPinned: boolean
  createdAt: string
}

export function NotesTab({ lineId }: { lineId: string }) {
  const notes = useOorCollection<Note>(lineId, 'notes')
  const { addRecord } = useOorMutations(lineId)

  return (
    <div className="space-y-3">
      <ThreadComposer
        fields={[
          { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Carton spec' },
          { name: 'category', label: 'Category', type: 'text', placeholder: 'packaging' },
          { name: 'body', label: 'Note', type: 'textarea', required: true, rows: 4 },
        ]}
        submitLabel="Save note"
        hint="Reference material — the running log lives in Comments."
        onSubmit={async (values) => {
          await addRecord.mutateAsync({
            path: 'notes',
            body: { title: values.title, body: values.body, category: values.category || undefined },
          })
        }}
      />

      {notes.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading notes…
        </div>
      ) : (notes.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No reference notes on this line.
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {notes.data!.rows.map((n) => (
            <div key={n.id} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
              <div className="flex items-center gap-2 mb-1">
                {n.isPinned ? <Pin size={11} style={{ color: 'var(--accent-secondary)' }} /> : null}
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                {n.category ? <Pill>{n.category}</Pill> : null}
              </div>
              <div className="text-[12px] whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>{n.body}</div>
              <div className="mt-1.5 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{formatLongDate(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
