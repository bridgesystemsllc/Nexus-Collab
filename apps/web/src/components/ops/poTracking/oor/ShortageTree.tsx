// ─── Shortage tree ──────────────────────────────────────────
// Bulk and components under a PO line, raw materials under a bulk. The
// indentation is the only thing carrying the parent-child relationship on
// screen, so it has to stay legible at every density.
//
// Mfg Comment wraps rather than truncating. It carries fill temperatures and
// transfer instructions — "***HOT FILL*** TRANSFER TEMPERATURE: 78-80*C" — and
// an ellipsis in the middle of a manufacturing instruction is worse than no
// instruction at all, because it looks like the whole thing.

import { useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { OOR_SHORTAGE_REASON_LABELS, type OorShortageReason } from '@nexus/shared'
import type { OorTreeNode } from './useOorQueries'
import { formatQtyNeed, formatShortDate } from './oorFormat'
import { CustomerProvidedPill, Pill } from './OorPills'

const CLASS_LABEL: Record<string, string> = {
  BULK: 'Bulk',
  COMPONENT: 'Component',
  RAW_MATERIAL: 'Raw material',
  OTHER: 'Material',
}

function isShort(node: OorTreeNode): boolean {
  const needed = Number(node.qtyNeeded ?? 0)
  if (needed <= 0) return false
  return Number(node.qtyOnHand ?? 0) < needed
}

function NodeRow({
  node,
  depth,
  onEdit,
}: {
  node: OorTreeNode
  depth: number
  onEdit?: (node: OorTreeNode) => void
}) {
  const short = isShort(node)
  const blocked = node.customerProvided && node.nodeStatus !== 'RESOLVED'
  const accent = blocked ? 'var(--warning)' : short ? 'var(--danger)' : 'transparent'

  return (
    <>
      <div
        className="oor-tree-row grid items-start gap-2 py-2 pr-3 text-[12px]"
        style={{
          gridTemplateColumns: '1.6fr 90px 60px 90px 110px 1.4fr',
          paddingLeft: 16 + depth * 22,
          borderLeft: `3px solid ${accent}`,
          borderBottom: '1px solid var(--border-default)',
          background: depth === 0 ? 'var(--bg-surface)' : 'transparent',
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500 }}>
              {node.partNumber ?? '—'}
            </span>
            <Pill tone={node.materialClass === 'BULK' ? 'accent' : 'neutral'}>
              {CLASS_LABEL[node.materialClass] ?? node.materialClass}
            </Pill>
            {node.componentType ? <Pill>{node.componentType}</Pill> : null}
            {node.customerProvided ? <CustomerProvidedPill /> : null}
            {node.nodeStatus === 'RESOLVED' ? <Pill tone="success">Resolved</Pill> : null}
          </div>
          <div className="mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {node.description ?? ''}
          </div>
        </div>

        <div className="text-right tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: short ? 'var(--danger)' : 'var(--text-primary)' }}>
          {formatQtyNeed(node.qtyNeeded)}
        </div>
        <div style={{ color: 'var(--text-tertiary)' }}>{node.uom ?? ''}</div>
        <div className="text-right tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {node.qtyOnHand === null ? '—' : formatQtyNeed(node.qtyOnHand)}
        </div>

        <div>
          {node.etaDate ? (
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {formatShortDate(node.etaDate)}
              {node.etaConfidence === 'estimated' ? (
                <span style={{ color: 'var(--text-tertiary)' }} title="Read from the Mfg Comment column"> est.</span>
              ) : null}
            </span>
          ) : short ? (
            // An unknown ETA is the worst case and reads as one.
            <Pill tone="danger">No ETA</Pill>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          )}
          {node.shortageReason !== 'NONE' ? (
            <div className="mt-1">
              <Pill tone="warning">{OOR_SHORTAGE_REASON_LABELS[node.shortageReason as OorShortageReason] ?? node.shortageReason}</Pill>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          {node.mfgComment ? (
            <div
              className="whitespace-pre-wrap leading-snug rounded-md px-2 py-1"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 11 }}
            >
              {node.mfgComment}
            </div>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="mt-1 text-[11px] underline"
              style={{ color: 'var(--accent-secondary)' }}
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>
      {node.children.map((child) => (
        <NodeRow key={child.id} node={child} depth={depth + 1} onEdit={onEdit} />
      ))}
    </>
  )
}

export function ShortageTree({
  nodes,
  loading,
  onEdit,
}: {
  nodes: OorTreeNode[] | undefined
  loading: boolean
  onEdit?: (node: OorTreeNode) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        <Loader2 size={13} className="animate-spin" /> Loading materials…
      </div>
    )
  }
  if (!nodes || nodes.length === 0) {
    return (
      <div className="px-6 py-4 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        No shortage tree on this line. The report it came from does not break this PO into materials.
      </div>
    )
  }

  return (
    <div>
      <div
        className="grid gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide"
        style={{
          gridTemplateColumns: '1.6fr 90px 60px 90px 110px 1.4fr',
          paddingLeft: 16,
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
        <div>Mfg Comment</div>
      </div>
      {nodes.map((node) => (
        <NodeRow key={node.id} node={node} depth={0} onEdit={onEdit} />
      ))}
    </div>
  )
}

/** The chevron + label a contract-manufacture line shows in the grid. */
export function ExpandAffordance({
  expanded,
  onToggle,
  cmCode,
  jobStatus,
  nodeCount,
}: {
  expanded: boolean
  onToggle: () => void
  cmCode: string | null
  jobStatus: string | null
  nodeCount: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex items-center gap-1.5 text-left"
      title={nodeCount > 0 ? `${nodeCount} materials` : 'No materials on this line'}
    >
      <ChevronRight
        size={14}
        className="oor-chevron"
        style={{ transform: expanded ? 'rotate(90deg)' : 'none', color: 'var(--text-tertiary)' }}
      />
      {cmCode ? (
        // Only named when the source actually names the manufacturer. The
        // customer open order report carries a work order but no CM code, and
        // "Contract Manufacture — —" tells the reader nothing.
        <span className="flex items-center gap-1">
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Contract Manufacture — {cmCode}
          </span>
          {jobStatus === 'ACT' ? <Pill tone="success">Active</Pill> : null}
        </span>
      ) : null}
    </button>
  )
}

export function useExpansionState(storageKey: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      return new Set(saved ? (JSON.parse(saved) as string[]) : [])
    } catch {
      // A browser refusing session storage is not a reason to fail to render.
      return new Set()
    }
  })

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        sessionStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        // Expansion state is a convenience; losing it costs a click.
      }
      return next
    })
  }

  return { expanded, toggle }
}
