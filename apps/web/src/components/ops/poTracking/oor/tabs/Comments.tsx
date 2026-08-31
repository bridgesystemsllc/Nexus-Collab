// ─── Comments ───────────────────────────────────────────────
// The running log. Imported entries keep their original date and initials and
// say so — a comment migrated from a 2026 spreadsheet cell should not look like
// something a colleague wrote this morning.

import { Loader2 } from 'lucide-react'
import { useOorCollection, useOorMutations } from '../useOorQueries'
import { ThreadComposer, commentDatePrefix } from '../ThreadComposer'
import { Pill } from '../OorPills'
import { formatLongDate } from '../oorFormat'

interface Comment {
  id: string
  body: string
  entryDate: string | null
  authorId: string | null
  authorInitials: string | null
  source: string
  isPinned: boolean
  createdAt: string
  editedAt: string | null
}

export function CommentsTab({ lineId }: { lineId: string }) {
  const comments = useOorCollection<Comment>(lineId, 'comments')
  const { addRecord } = useOorMutations(lineId)

  return (
    <div className="space-y-3">
      <ThreadComposer
        fields={[{ name: 'body', label: 'Comment', type: 'textarea', required: true, rows: 3,
          placeholder: 'What changed, and what happens next.' }]}
        submitLabel="Post comment"
        // Prefilled in the house convention so an exported file still reads the
        // way it does today to whoever is working out of Excel.
        initial={{ body: commentDatePrefix() }}
        hint="Dated in the house format so exports stay readable."
        onSubmit={async (values) => {
          await addRecord.mutateAsync({ path: 'comments', body: { body: values.body } })
        }}
      />

      {comments.isLoading ? (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading comments…
        </div>
      ) : (comments.data?.rows.length ?? 0) === 0 ? (
        <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          Nothing logged on this line yet.
        </div>
      ) : (
        <div className="space-y-2">
          {comments.data!.rows.map((c) => (
            <div
              key={c.id}
              className="rounded-xl px-3 py-2.5"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${c.isPinned ? 'var(--accent-secondary)' : 'var(--border-default)'}` }}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {c.authorInitials ?? c.authorId ?? 'Someone'}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {c.entryDate ? formatLongDate(c.entryDate) : formatLongDate(c.createdAt)}
                </span>
                {c.source === 'imported_legacy' ? (
                  <Pill title="Migrated from the report's Comments column">Imported</Pill>
                ) : null}
                {c.isPinned ? <Pill tone="accent">Pinned</Pill> : null}
                {c.editedAt ? <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>edited</span> : null}
              </div>
              <div className="text-[13px] whitespace-pre-wrap leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
