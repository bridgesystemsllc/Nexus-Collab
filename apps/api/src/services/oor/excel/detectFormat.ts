// ─── Open Order Report format detection ─────────────────────
// The two reports arrive as bare spreadsheets with no metadata, so the header
// row is the only thing that identifies which one you are holding. Detection
// keys on the pair of columns unique to each format rather than on a full
// header match — upstream Crystal Reports edits add and reorder columns, and a
// strict match would reject a file a human would call obviously valid.

export type OorFormat = 'customer_open_order' | 'open_order_shortage'

export class UnknownReportFormatError extends Error {
  constructor(found: string[]) {
    super(
      `Unrecognised Open Order Report format. Expected either "Customer PO Number" + "RemQty" ` +
        `(customer open order) or "Lvl1 Part" + "QTY Need" (shortage report). Headers found: ${found.join(', ')}`,
    )
    this.name = 'UnknownReportFormatError'
  }
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

export function detectFormat(headerRow: unknown[]): OorFormat {
  const cells = headerRow.map(norm)
  const has = (label: string) => cells.includes(label)
  if (has('customer po number') && has('remqty')) return 'customer_open_order'
  if (has('lvl1 part') && has('qty need')) return 'open_order_shortage'
  throw new UnknownReportFormatError(headerRow.map((c) => String(c ?? '')).filter(Boolean))
}
