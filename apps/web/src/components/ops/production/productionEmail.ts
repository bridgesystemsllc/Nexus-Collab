// ─── Production Update Email Builder ─────────────────────────────────────────
// Turns a ProductionOrder into a clean, email-client-friendly summary in three
// representations: subject, inline-styled HTML, and a plain-text fallback (used
// for the Copy-to-clipboard path). Null-safe throughout — items may arrive
// partially populated (wrapped item.data) so every field is defensively read.

import type { ProductionOrder, ProductionNote } from './productionData'
import { formatCurrency } from './productionData'

export interface ProductionUpdateEmail {
  subject: string
  html: string
  text: string
}

// ─── Local formatting helpers (kept self-contained / null-safe) ──────────────

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return String(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtNum(n?: number | null): string {
  return (Number(n) || 0).toLocaleString('en-US')
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Notes newest-first. Tolerates both new (noteDate/noteText/createdBy) and
// deprecated (date/text/author) field names.
function sortedNotes(notes?: ProductionNote[] | null): ProductionNote[] {
  const arr = Array.isArray(notes) ? [...notes] : []
  return arr.reverse()
}

function noteDateOf(n: ProductionNote): string {
  return fmtDate(n.noteDate ?? n.date ?? '')
}
function noteTextOf(n: ProductionNote): string {
  return n.noteText ?? n.text ?? ''
}
function noteAuthorOf(n: ProductionNote): string {
  return n.createdBy ?? n.author ?? 'User'
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function buildProductionUpdateEmail(
  item: Partial<ProductionOrder> | null | undefined
): ProductionUpdateEmail {
  // Tolerate both the rich ProductionOrder shape and the legacy compact shape
  // used by seeded/live items (product/poNumber/progress/qty/value/eta/priority).
  // Reading both keeps the email meaningful instead of emitting blanks/zeros.
  const d = (item || {}) as Partial<ProductionOrder> & {
    product?: string
    poNumber?: string
    progress?: number
    qty?: number
    value?: number
    eta?: string
    priority?: string
    coworkPending?: boolean
  }

  const description = d.description?.trim() || d.product?.trim() || 'Production Item'
  const ref = d.salesOrder?.trim() || d.itemNumber?.trim() || d.poNumber?.trim() || '—'
  const subject = `Production Update — ${description} (${ref})`

  const brand = d.brand?.trim() || '—'
  const cm = d.cm?.trim() || '—'
  const status = d.status?.trim() || '—'
  const progress = Number(d.progressPct ?? d.progress) || 0

  // qtyOrdered falls back to the legacy single `qty`; produced/remaining derive
  // from it when not separately tracked so the email never shows bare zeros.
  const qtyOrdered = Number(d.qtyOrdered ?? d.qty) || 0
  const qtyProduced = Number(d.qtyProduced) || 0
  const qtyRemaining =
    d.qtyRemaining != null ? Number(d.qtyRemaining) || 0 : Math.max(0, qtyOrdered - qtyProduced)

  const onHold = status === 'On Hold'
  const isEmergency = !!d.isEmergency || d.priority === 'emergency'

  // Order value: prefer rich `orderValue`, fall back to legacy `value` (only when
  // it's a real non-zero amount — seed `value` is often 0).
  const orderValueRaw = d.orderValue != null ? d.orderValue : d.value
  const hasOrderValue = orderValueRaw != null && Number(orderValueRaw) > 0

  // Dates: rich shape has order/ship/promised; legacy shape carries a single
  // `eta` we surface as the ship/promised date.
  const orderDate = d.orderDate
  const shipDate = d.shipDate ?? d.eta
  const promisedDate = d.promisedDate ?? d.eta

  const notes = sortedNotes(d.notes)

  // Reference line for the header/subheader: prefer SO + Item #, otherwise fall
  // back to the PO number so legacy items still show an identifier (not "SO —").
  const metaRef =
    d.salesOrder?.trim() || d.itemNumber?.trim()
      ? `SO ${esc(d.salesOrder || '—')} &middot; Item #${esc(d.itemNumber || '—')}`
      : `PO ${esc(ref)}`

  // ── Plain text ──────────────────────────────────────────────────────────
  const textLines: string[] = []
  textLines.push(`PRODUCTION UPDATE`)
  textLines.push(``)
  textLines.push(`${description}`)
  textLines.push(`Brand: ${brand}   |   CM: ${cm}`)
  textLines.push(`Sales Order: ${d.salesOrder || '—'}   |   Item #: ${d.itemNumber || '—'}`)
  if (d.customerPo || d.poNumber) textLines.push(`Customer PO: ${d.customerPo || d.poNumber}`)
  textLines.push(`Status: ${status}   |   Progress: ${progress}%`)
  if (isEmergency || onHold) {
    const flags = [isEmergency ? 'EMERGENCY / RUSH' : null, onHold ? 'ON HOLD' : null]
      .filter(Boolean)
      .join(' · ')
    textLines.push(`Flags: ${flags}`)
  }
  textLines.push(``)
  textLines.push(`Quantities`)
  textLines.push(`  Produced:  ${fmtNum(qtyProduced)}`)
  textLines.push(`  Remaining: ${fmtNum(qtyRemaining)}`)
  textLines.push(`  Ordered:   ${fmtNum(qtyOrdered)}`)
  if (hasOrderValue) textLines.push(`  Order Value: ${formatCurrency(Number(orderValueRaw) || 0)}`)
  textLines.push(``)
  textLines.push(`Key Dates`)
  textLines.push(`  Order Date:    ${fmtDate(orderDate)}`)
  textLines.push(`  Ship Date:     ${fmtDate(shipDate)}`)
  textLines.push(`  Promised Date: ${fmtDate(promisedDate)}`)
  textLines.push(``)
  textLines.push(`Latest Updates`)
  if (notes.length === 0) {
    textLines.push(`  No updates logged yet.`)
  } else {
    for (const n of notes) {
      textLines.push(`  • [${noteDateOf(n)}] ${noteTextOf(n)} — ${noteAuthorOf(n)}`)
    }
  }
  const text = textLines.join('\n')

  // ── HTML ────────────────────────────────────────────────────────────────
  const accent = '#2F80ED'
  const flagBadges: string[] = []
  if (isEmergency) {
    flagBadges.push(
      `<span style="display:inline-block;background:#FDECEA;color:#C0392B;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.4px;">EMERGENCY / RUSH</span>`
    )
  }
  if (onHold) {
    flagBadges.push(
      `<span style="display:inline-block;background:#FDECEA;color:#C0392B;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.4px;">ON HOLD</span>`
    )
  }

  const rowStyle = `padding:7px 0;font-size:13px;color:#3c4043;border-bottom:1px solid #f0f0f0;`
  const labelStyle = `padding:7px 0;font-size:13px;color:#80868b;width:140px;border-bottom:1px solid #f0f0f0;`

  const notesHtml =
    notes.length === 0
      ? `<p style="margin:0;font-size:13px;color:#80868b;font-style:italic;">No updates logged yet.</p>`
      : notes
          .map(
            (n) => `
            <tr>
              <td style="padding:8px 0;vertical-align:top;border-bottom:1px solid #f0f0f0;">
                <span style="display:inline-block;font-size:11px;font-weight:700;font-family:monospace;color:${accent};background:#eaf1fd;padding:2px 8px;border-radius:999px;">${esc(
              noteDateOf(n)
            )}</span>
                <span style="font-size:11px;color:#80868b;margin-left:6px;">${esc(noteAuthorOf(n))}</span>
                <div style="margin-top:4px;font-size:13px;color:#3c4043;line-height:1.5;">${esc(
                  noteTextOf(n)
                )}</div>
              </td>
            </tr>`
          )
          .join('')

  const html = `
<div style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:14px;overflow:hidden;">
      <!-- Header -->
      <div style="padding:22px 28px;border-bottom:1px solid #eef0f2;">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:${accent};text-transform:uppercase;">Production Update</div>
        <h1 style="margin:6px 0 4px;font-size:20px;font-weight:600;color:#1a1a1a;line-height:1.3;">${esc(
          description
        )}</h1>
        <div style="font-size:13px;color:#80868b;">${esc(brand)} &middot; ${esc(cm)} &middot; ${metaRef}</div>
        ${
          flagBadges.length
            ? `<div style="margin-top:12px;">${flagBadges.join('&nbsp;')}</div>`
            : ''
        }
        <div style="margin-top:16px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#80868b;margin-bottom:5px;">
            <span style="font-weight:600;color:#3c4043;">${esc(status)}</span>
            <span>${progress}%</span>
          </div>
          <div style="height:8px;background:#eef0f2;border-radius:999px;overflow:hidden;">
            <div style="height:8px;width:${Math.max(0, Math.min(100, progress))}%;background:${accent};border-radius:999px;"></div>
          </div>
        </div>
      </div>

      <!-- Quantities -->
      <div style="padding:18px 28px;border-bottom:1px solid #eef0f2;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:#80868b;text-transform:uppercase;margin-bottom:10px;">Quantities</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${labelStyle}">Produced</td>
            <td style="${rowStyle};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${fmtNum(
    qtyProduced
  )}</td>
          </tr>
          <tr>
            <td style="${labelStyle}">Remaining</td>
            <td style="${rowStyle};text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${fmtNum(
    qtyRemaining
  )}</td>
          </tr>
          <tr>
            <td style="${labelStyle};border-bottom:none;">Ordered</td>
            <td style="${rowStyle};border-bottom:none;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;">${fmtNum(
    qtyOrdered
  )}</td>
          </tr>
        </table>
      </div>

      <!-- Key Dates -->
      <div style="padding:18px 28px;border-bottom:1px solid #eef0f2;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:#80868b;text-transform:uppercase;margin-bottom:10px;">Key Dates</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${labelStyle}">Order Date</td>
            <td style="${rowStyle};text-align:right;">${esc(fmtDate(orderDate))}</td>
          </tr>
          <tr>
            <td style="${labelStyle}">Ship Date</td>
            <td style="${rowStyle};text-align:right;">${esc(fmtDate(shipDate))}</td>
          </tr>
          <tr>
            <td style="${labelStyle};border-bottom:none;">Promised Date</td>
            <td style="${rowStyle};border-bottom:none;text-align:right;">${esc(fmtDate(promisedDate))}</td>
          </tr>
        </table>
      </div>

      <!-- Latest Updates -->
      <div style="padding:18px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.6px;color:#80868b;text-transform:uppercase;margin-bottom:10px;">Latest Updates</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${notesHtml}
        </table>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#aab0b6;margin:16px 0 0;">Sent from Nexus Collab &middot; Operations</p>
  </div>
</div>`.trim()

  return { subject, html, text }
}
