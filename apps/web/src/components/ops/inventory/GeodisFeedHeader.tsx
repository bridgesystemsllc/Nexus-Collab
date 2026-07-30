import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleSlash, Upload, Clock } from 'lucide-react'
import { useGeodisFeedStatus, useUploadGeodisInventory } from '../../../hooks/useData'

// ─── Geodis feed status strip ────────────────────────────────
// Sits above the inventory table when the Geodis warehouse is in view. Its job
// is to answer one question at a glance: is what I'm looking at current?
//
// An automated feed that quietly stops is the failure mode that costs money —
// stale stock reads as real stock. So a held or failed run is stated plainly
// rather than tucked into a log nobody opens.

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'never'
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

// A snapshot older than a day means the scheduled report stopped arriving.
function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true
  const then = new Date(iso).getTime()
  return !Number.isFinite(then) || Date.now() - then > 36 * 60 * 60 * 1000
}

type Tone = 'ok' | 'warn' | 'bad'

const TONE: Record<Tone, { color: string; bg: string }> = {
  ok: { color: 'var(--success)', bg: 'rgba(50, 215, 75, 0.10)' },
  warn: { color: 'var(--warning)', bg: 'rgba(255, 159, 10, 0.10)' },
  bad: { color: 'var(--danger)', bg: 'rgba(255, 69, 58, 0.10)' },
}

export function GeodisFeedHeader({ itemCount }: { itemCount: number }) {
  const { data: status, isLoading } = useGeodisFeedStatus()
  const upload = useUploadGeodisInventory()
  const fileInput = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<any>(null)

  if (isLoading || !status?.configured) return null

  const lastRun = status.lastRun
  const stale = isStale(status.lastSyncAt)

  let tone: Tone = 'ok'
  let headline = `Last import ${relativeTime(status.lastSyncAt)}`
  let detail = `${itemCount.toLocaleString()} SKUs`

  if (lastRun?.status === 'held') {
    tone = 'warn'
    headline = 'Last import was held — nothing was changed'
    detail = (lastRun.errors as any)?.heldReason || 'The report looked truncated.'
  } else if (lastRun?.status === 'mapping_error') {
    tone = 'bad'
    headline = 'Last import failed — the file columns did not match'
    detail = (lastRun.errors as any)?.message || 'Update the column mapping and re-send.'
  } else if (lastRun?.status === 'error') {
    tone = 'bad'
    headline = 'Last import failed — nothing was changed'
    detail = (lastRun.errors as any)?.message || 'See the import history for detail.'
  } else if (!status.lastSyncAt) {
    tone = 'warn'
    headline = 'No inventory has been imported yet'
    detail = 'Upload a Geodis stock file to get started.'
  } else if (stale) {
    tone = 'warn'
    headline = `Last import ${relativeTime(status.lastSyncAt)} — the scheduled report may have stopped`
    detail = `${itemCount.toLocaleString()} SKUs, possibly stale`
  }

  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : CircleSlash
  const { color, bg } = TONE[tone]

  const onPick = (file: File | undefined, overrideGuard = false) => {
    if (!file) return
    setResult(null)
    upload.mutate({ file, overrideGuard }, { onSuccess: (r) => setResult({ ...r, file }) })
  }

  return (
    <div
      className="rounded-xl border px-4 py-3 transition-colors"
      style={{ borderColor: 'var(--border-subtle)', background: bg }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 shrink-0" style={{ color }}>
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{headline}</p>
          {/* The result panel below restates the same run in full, so showing
              this line too would just repeat it back at the user. */}
          {!result && (
            <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-0.5">
              {tone === 'ok' && <Clock size={11} className="shrink-0" />}
              <span className="truncate">{detail}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files?.[0])
            // Reset so re-picking the same file still fires a change event.
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50 transition-colors"
        >
          <Upload size={13} />
          {upload.isPending ? 'Importing…' : 'Upload file'}
        </button>
      </div>
      </div>

      {result && (
        <ImportResult
          result={result}
          onApplyAnyway={() => onPick(result.file, true)}
          onDismiss={() => setResult(null)}
          pending={upload.isPending}
        />
      )}
    </div>
  )
}

// The outcome of a manual upload. A held import is the interesting case: it is
// a refusal to write, so it offers the override rather than just reporting.
function ImportResult({
  result,
  onApplyAnyway,
  onDismiss,
  pending,
}: {
  result: any
  onApplyAnyway: () => void
  onDismiss: () => void
  pending: boolean
}) {
  const held = result.status === 'held'
  const ok = result.ok

  return (
    <div className="w-full mt-2 sm:mt-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
      <p className="text-xs text-[var(--text-primary)]">{result.message}</p>
      {result.foundHeaders?.length > 0 && (
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1 font-mono truncate">
          Columns found: {result.foundHeaders.join(', ')}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        {held && (
          <button
            onClick={onApplyAnyway}
            disabled={pending}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--border-default)] text-[var(--warning)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 transition-colors"
          >
            Apply anyway
          </button>
        )}
        <button
          onClick={onDismiss}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {ok ? 'Done' : 'Dismiss'}
        </button>
      </div>
    </div>
  )
}
