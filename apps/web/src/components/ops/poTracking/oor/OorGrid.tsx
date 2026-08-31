// ─── The grid ───────────────────────────────────────────────
// Excel parity is the requirement: sticky header, sticky first column,
// per-column filters mirroring the source autofilter, multi-column sort,
// resizable and hideable columns whose layout persists per user, keyboard
// navigation, and a range copy that pastes into Excel as cells.
//
// Every one of those is server-driven where it touches data. The operator's
// working set is thousands of lines and grows weekly; a grid that "loads
// everything and filters in the browser" would work for exactly one import.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, MessageSquare, FileText, CalendarClock, Mail } from 'lucide-react'
import type { OorColumn } from './oorColumns'
import type { OorLineRow } from './useOorQueries'
import { useOorTree } from './useOorQueries'
import { ShortageTree, ExpandAffordance } from './ShortageTree'
import { StatusPill, RiskPill } from './OorPills'
import { toTsv } from './oorFormat'

const LAYOUT_KEY = 'oor.grid.layout.v1'

interface Layout {
  widths: Record<string, number>
  hidden: string[]
}

function loadLayout(): Layout {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) return JSON.parse(saved) as Layout
  } catch {
    // A browser that refuses local storage still gets a working grid.
  }
  return { widths: {}, hidden: [] }
}

function ExpandableRow({
  row,
  columns,
  layout,
  expanded,
  onToggle,
  onOpen,
  focused,
  density,
}: {
  row: OorLineRow
  columns: OorColumn[]
  layout: Layout
  expanded: boolean
  onToggle: () => void
  onOpen: () => void
  focused: boolean
  density: 'comfortable' | 'compact'
}) {
  // Nothing loads until the row is opened: 58 lines would otherwise be 58 tree
  // queries for the two or three anyone actually looks at.
  const tree = useOorTree(row.id, expanded)
  const rowPad = density === 'compact' ? '4px 8px' : '8px 10px'

  const accent =
    row.riskLevel === 'critical' ? 'var(--danger)' : row.riskLevel === 'at_risk' ? 'var(--warning)' : 'transparent'

  return (
    <>
      <tr
        data-oor-row={row.id}
        tabIndex={focused ? 0 : -1}
        onDoubleClick={onOpen}
        className="oor-row"
        style={{
          borderLeft: `3px solid ${accent}`,
          background: focused ? 'var(--accent-secondary-light)' : undefined,
          outline: focused ? '1px solid var(--accent-secondary)' : undefined,
        }}
      >
        <td style={{ padding: rowPad, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-base)' }}>
          <ExpandAffordance
            expanded={expanded}
            onToggle={onToggle}
            cmCode={row.fulfillmentType === 'CONTRACT_MFG' ? row.cmCode : null}
            jobStatus={row.jobStatus}
            nodeCount={row._count.nodes}
          />
        </td>
        {columns.map((col) => {
          if (layout.hidden.includes(col.key)) return null
          const text = col.value(row)
          return (
            <td
              key={col.key}
              title={col.title?.(row) ?? (text.length > 28 ? text : undefined)}
              style={{
                padding: rowPad,
                width: layout.widths[col.key] ?? col.width,
                minWidth: layout.widths[col.key] ?? col.width,
                textAlign: col.align ?? 'left',
                fontFamily: col.mono ? 'var(--font-mono)' : undefined,
                fontSize: col.mono ? 12 : 13,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {col.key === 'valueComputed' && row.valueMismatch ? (
                <span className="inline-flex items-center gap-1">
                  {text}
                  <span
                    title="The report's own Value disagrees with RemQty x Price. This is the recomputed figure."
                    style={{ color: 'var(--warning)', fontSize: 11 }}
                  >
                    ▲
                  </span>
                </span>
              ) : (
                text
              )}
            </td>
          )
        })}
        <td style={{ padding: rowPad }}>
          <div className="flex items-center gap-1">
            <StatusPill
              status={row.lineStatus}
              overridden={row.statusSource === 'manual'}
              reason={row.statusOverrideReason}
            />
            <RiskPill risk={row.riskLevel} />
          </div>
        </td>
        <td style={{ padding: rowPad }}>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {row._count.comments > 0 ? <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} />{row._count.comments}</span> : null}
            {row._count.notes > 0 ? <span className="inline-flex items-center gap-0.5"><FileText size={11} />{row._count.notes}</span> : null}
            {row._count.meetingUpdates > 0 ? <span className="inline-flex items-center gap-0.5"><CalendarClock size={11} />{row._count.meetingUpdates}</span> : null}
          </div>
        </td>
        <td style={{ padding: rowPad }}>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
            style={{ background: 'var(--accent-secondary)', color: '#fff' }}
          >
            Open Order Report
            <ChevronRight size={12} />
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={columns.length + 4} style={{ padding: 0, background: 'var(--bg-base)' }}>
            <div className="oor-tree-panel">
              <ShortageTree nodes={tree.data} loading={tree.isLoading} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function OorGrid({
  rows,
  columns,
  loading,
  sort,
  dir,
  onSort,
  columnFilters,
  onColumnFilter,
  expanded,
  onToggleExpand,
  onOpenLine,
  density,
}: {
  rows: OorLineRow[]
  columns: OorColumn[]
  loading: boolean
  sort: string
  dir: 'asc' | 'desc'
  onSort: (key: string) => void
  columnFilters: Record<string, string>
  onColumnFilter: (key: string, value: string) => void
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onOpenLine: (id: string) => void
  density: 'comfortable' | 'compact'
}) {
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  const visibleColumns = useMemo(() => columns.filter((c) => !layout.hidden.includes(c.key)), [columns, layout.hidden])

  const persist = useCallback((next: Layout) => {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next))
    } catch {
      // Layout is a preference, not data; failing to save it changes nothing.
    }
  }, [])

  // ── Column resize ──
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const r = resizing.current
      if (!r) return
      const width = Math.max(60, r.startWidth + (e.clientX - r.startX))
      setLayout((prev) => ({ ...prev, widths: { ...prev.widths, [r.key]: width } }))
    }
    const up = () => {
      if (resizing.current) {
        resizing.current = null
        setLayout((prev) => {
          try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(prev))
          } catch {
            /* preference only */
          }
          return prev
        })
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  // ── Keyboard navigation ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onOpenLine(rows[focusIndex]!.id)
    } else if (e.key === ' ') {
      e.preventDefault()
      onToggleExpand(rows[focusIndex]!.id)
    }
  }

  // ── Copy as TSV ──
  const onCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection()?.toString()
    if (selection && selection.length > 0) return
    e.preventDefault()
    const header = visibleColumns.map((c) => c.header)
    const body = rows.map((r) => visibleColumns.map((c) => c.value(r)))
    e.clipboardData.setData('text/plain', toTsv([header, ...body]))
  }

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-oor-row="${rows[focusIndex]?.id}"]`)
    el?.focus({ preventScroll: false })
  }, [focusIndex, rows])

  return (
    <div
      ref={containerRef}
      className="oor-grid-scroll rounded-xl"
      style={{ border: '1px solid var(--border-default)', overflow: 'auto', maxHeight: '62vh', background: 'var(--bg-base)' }}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      tabIndex={0}
    >
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 3 }}>
          <tr style={{ background: 'var(--bg-hover)' }}>
            <th style={{ position: 'sticky', left: 0, zIndex: 4, background: 'var(--bg-hover)', width: 210, textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-strong)' }}>
              Line
            </th>
            {visibleColumns.map((col) => {
              const active = sort === col.sortKey
              return (
                <th
                  key={col.key}
                  style={{
                    position: 'relative',
                    width: layout.widths[col.key] ?? col.width,
                    minWidth: layout.widths[col.key] ?? col.width,
                    textAlign: col.align ?? 'left',
                    padding: '8px 10px',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: active ? 'var(--accent-secondary)' : 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-strong)',
                    cursor: col.sortKey ? 'pointer' : 'default',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => col.sortKey && onSort(col.sortKey)}
                  title={col.sortKey ? `Sort by ${col.header}` : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {active ? (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : null}
                  </span>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      resizing.current = {
                        key: col.key,
                        startX: e.clientX,
                        startWidth: layout.widths[col.key] ?? col.width,
                      }
                    }}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize' }}
                  />
                </th>
              )
            })}
            <th style={{ padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-strong)', textAlign: 'left', width: 200 }}>
              Status
            </th>
            <th style={{ padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-strong)', textAlign: 'left', width: 110 }}>
              Activity
            </th>
            <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-strong)', width: 170 }} />
          </tr>
          {/* Per-column filters, mirroring the autofilter row in the source file. */}
          <tr style={{ background: 'var(--bg-surface)' }}>
            <th style={{ position: 'sticky', left: 0, zIndex: 4, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }} />
            {visibleColumns.map((col) => (
              <th key={col.key} style={{ padding: '3px 6px', borderBottom: '1px solid var(--border-default)' }}>
                <input
                  value={columnFilters[col.key] ?? ''}
                  onChange={(e) => onColumnFilter(col.key, e.target.value)}
                  placeholder="Filter"
                  aria-label={`Filter ${col.header}`}
                  className="w-full rounded px-1.5 py-1 text-[11px]"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                />
              </th>
            ))}
            <th colSpan={3} style={{ borderBottom: '1px solid var(--border-default)' }} />
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0
            ? // Skeleton rows, never a spinner over the grid: the shape of the
              // table should not disappear while it reloads.
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td colSpan={visibleColumns.length + 4} style={{ padding: '10px' }}>
                    <div className="oor-skeleton" style={{ height: 14, borderRadius: 4 }} />
                  </td>
                </tr>
              ))
            : rows.map((row, i) => (
                <ExpandableRow
                  key={row.id}
                  row={row}
                  columns={visibleColumns}
                  layout={layout}
                  expanded={expanded.has(row.id)}
                  onToggle={() => onToggleExpand(row.id)}
                  onOpen={() => onOpenLine(row.id)}
                  focused={i === focusIndex}
                  density={density}
                />
              ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length + 4} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No open lines match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export { LAYOUT_KEY }
