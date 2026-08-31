// ─── Production Tracker ─────────────────────────────────────
// The shortage tree as an editable grid, plus the stage strip that answers
// "where is this in the plant" at a glance.
//
// The stages are derived from the tree rather than stored: a bulk that is short
// means the line has not reached Fill, whatever anyone typed last week. Storing
// a stage would create a second thing to keep in sync with the materials, and
// the materials are the truth.

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { OOR_SHORTAGE_REASONS, OOR_SHORTAGE_REASON_LABELS, type OorShortageReason } from '@nexus/shared'
import { useOorMutations, type OorTreeNode } from '../useOorQueries'
import { formatQtyNeed, formatShortDate } from '../oorFormat'
import { CustomerProvidedPill, Pill } from '../OorPills'

const STAGES = ['Bulk', 'Components', 'Fill', 'QC', 'Pack', 'Ready', 'Shipped'] as const

const flatten = (nodes: OorTreeNode[]): OorTreeNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)])

const isShort = (n: OorTreeNode) => {
  const need = Number(n.qtyNeeded ?? 0)
  return need > 0 && Number(n.qtyOnHand ?? 0) < need && n.nodeStatus !== 'RESOLVED'
}

function currentStage(nodes: OorTreeNode[]): { index: number; blockers: OorTreeNode[] } {
  const all = flatten(nodes)
  const blockers = all.filter(isShort)
  const bulkShort = blockers.filter((n) => n.materialClass === 'BULK' || n.materialClass === 'RAW_MATERIAL')
  const componentShort = blockers.filter((n) => n.materialClass === 'COMPONENT')
  if (bulkShort.length > 0) return { index: 0, blockers: bulkShort }
  if (componentShort.length > 0) return { index: 1, blockers: componentShort }
  return { index: 2, blockers: [] }
}

function StageStrip({ nodes }: { nodes: OorTreeNode[] }) {
  const { index, blockers } = currentStage(nodes)
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1 flex-wrap">
        {STAGES.map((stage, i) => {
          const done = i < index
          const active = i === index
          return (
            <div key={stage} className="flex items-center gap-1">
              <div
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: active ? 'var(--accent-secondary)' : done ? 'var(--success-light)' : 'var(--bg-hover)',
                  color: active ? '#fff' : done ? 'var(--success)' : 'var(--text-tertiary)',
                  border: `1px solid ${active ? 'var(--accent-secondary)' : 'transparent'}`,
                }}
              >
                {done ? <Check size={10} className="inline mr-1" /> : null}
                {stage}
              </div>
              {i < STAGES.length - 1 ? <span style={{ color: 'var(--border-strong)' }}>›</span> : null}
            </div>
          )
        })}
      </div>
      {blockers.length > 0 ? (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          Held by{' '}
          {blockers.slice(0, 4).map((b, i) => (
            <span key={b.id}>
              {i > 0 ? ', ' : ''}
              <span style={{ fontFamily: 'var(--font-mono)' }}>{b.partNumber}</span>
              {b.etaDate ? ` (ETA ${formatShortDate(b.etaDate)})` : ' (no ETA)'}
            </span>
          ))}
          {blockers.length > 4 ? ` and ${blockers.length - 4} more` : ''}
        </div>
      ) : (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--success)' }}>No outstanding material shortages.</div>
      )}
    </div>
  )
}

function EditableRow({ node, lineId, depth }: { node: OorTreeNode; lineId: string; depth: number }) {
  const { patchNode } = useOorMutations(lineId)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const value = (field: keyof OorTreeNode, fallback = '') =>
    draft[field as string] ?? (node[field] === null || node[field] === undefined ? fallback : String(node[field]))

  const commit = async (field: string, raw: string) => {
    const patch: Record<string, unknown> = {}
    if (field === 'qtyOnHand') patch.qtyOnHand = raw === '' ? null : Number(raw)
    else if (field === 'etaDate') patch.etaDate = raw === '' ? null : raw
    else if (field === 'mfgComment') patch.mfgComment = raw === '' ? null : raw
    else patch[field] = raw
    await patchNode.mutateAsync({ id: node.id, patch })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  const short = isShort(node)
  const inputStyle = {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
  }

  return (
    <>
      <div
        className="grid gap-2 items-start py-2 pr-3 text-[12px]"
        style={{
          gridTemplateColumns: '1.5fr 80px 55px 90px 110px 100px 130px 1.2fr',
          paddingLeft: 12 + depth * 20,
          borderBottom: '1px solid var(--border-default)',
          borderLeft: `3px solid ${node.customerProvided && node.nodeStatus !== 'RESOLVED' ? 'var(--warning)' : short ? 'var(--danger)' : 'transparent'}`,
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{node.partNumber ?? '—'}</span>
            {node.customerProvided ? <CustomerProvidedPill /> : null}
            {saved ? <Pill tone="success">Saved</Pill> : null}
            {patchNode.isPending ? <Loader2 size={11} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} /> : null}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{node.description ?? ''}</div>
        </div>

        <div className="text-right tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: short ? 'var(--danger)' : undefined }}>
          {formatQtyNeed(node.qtyNeeded)}
        </div>
        <div style={{ color: 'var(--text-tertiary)' }}>{node.uom ?? ''}</div>

        <input
          aria-label="On hand"
          defaultValue={value('qtyOnHand')}
          onChange={(e) => setDraft((d) => ({ ...d, qtyOnHand: e.target.value }))}
          onBlur={(e) => e.target.value !== String(node.qtyOnHand ?? '') && commit('qtyOnHand', e.target.value)}
          className="w-full rounded px-1.5 py-1 text-right"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
        />

        <input
          type="date"
          aria-label="ETA"
          defaultValue={node.etaDate ? String(node.etaDate).slice(0, 10) : ''}
          onChange={(e) => setDraft((d) => ({ ...d, etaDate: e.target.value }))}
          onBlur={(e) => {
            const current = node.etaDate ? String(node.etaDate).slice(0, 10) : ''
            if (e.target.value !== current) commit('etaDate', e.target.value)
          }}
          className="w-full rounded px-1.5 py-1"
          style={inputStyle}
        />

        <select
          aria-label="Status"
          defaultValue={node.nodeStatus}
          onChange={(e) => commit('nodeStatus', e.target.value)}
          className="w-full rounded px-1 py-1"
          style={inputStyle}
        >
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ORDERED">Ordered</option>
          <option value="RECEIVED">Received</option>
        </select>

        <select
          aria-label="Shortage reason"
          defaultValue={node.shortageReason}
          onChange={(e) => commit('shortageReason', e.target.value)}
          className="w-full rounded px-1 py-1"
          style={inputStyle}
        >
          {OOR_SHORTAGE_REASONS.map((r) => (
            <option key={r} value={r}>{OOR_SHORTAGE_REASON_LABELS[r as OorShortageReason]}</option>
          ))}
        </select>

        <textarea
          aria-label="Mfg Comment"
          defaultValue={node.mfgComment ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, mfgComment: e.target.value }))}
          onBlur={(e) => e.target.value !== (node.mfgComment ?? '') && commit('mfgComment', e.target.value)}
          rows={2}
          className="w-full rounded px-1.5 py-1"
          style={{ ...inputStyle, resize: 'vertical', fontSize: 11 }}
        />
      </div>
      {node.children.map((child) => (
        <EditableRow key={child.id} node={child} lineId={lineId} depth={depth + 1} />
      ))}
    </>
  )
}

export function ProductionTrackerTab({
  lineId,
  nodes,
  loading,
}: {
  lineId: string
  nodes: OorTreeNode[] | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="oor-skeleton" style={{ height: 20, borderRadius: 4 }} />
        ))}
      </div>
    )
  }
  if (!nodes || nodes.length === 0) {
    return (
      <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
        This line has no material tree. It came from a report that tracks purchase orders but not the bulk and
        components beneath them.
      </div>
    )
  }

  return (
    <div>
      <StageStrip nodes={nodes} />
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
        <div
          className="grid gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide"
          style={{
            gridTemplateColumns: '1.5fr 80px 55px 90px 110px 100px 130px 1.2fr',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-hover)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>Material</div>
          <div className="text-right">QTY Need</div>
          <div>UOM</div>
          <div className="text-right">On hand</div>
          <div>ETA</div>
          <div>Status</div>
          <div>Reason</div>
          <div>Mfg Comment</div>
        </div>
        {nodes.map((node) => (
          <EditableRow key={node.id} node={node} lineId={lineId} depth={0} />
        ))}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        Edits save when you leave a field, and are recorded in Activity. A material you edit keeps your values
        when next week's report is imported.
      </p>
    </div>
  )
}
