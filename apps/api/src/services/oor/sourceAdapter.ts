// ─── Open Order Report source adapters ──────────────────────
// Everything upstream of the database speaks these types. The Excel file drop
// is one implementation; the KarEve ERP feed is another; an EDI/SPS feed could
// be a third. Parsing stays pure — no I/O, no Prisma — so a parser can be
// tested against a fixture without a database, and so replacing the source
// never reaches the UI.

import type { OorFormat } from './excel/detectFormat'

/** A value the source got wrong. Recorded, surfaced for review, never fatal. */
export interface ParseWarning {
  rowNumber: number
  column: string
  rawValue: string
  storedValue: string | null
  reason: string
}

export interface ParsedComment {
  body: string
  entryDate: Date | null
  authorInitials: string | null
}

export type MaterialClass = 'BULK' | 'COMPONENT' | 'RAW_MATERIAL' | 'OTHER'
export type EtaConfidence = 'confirmed' | 'estimated' | 'unknown'
export type FulfillmentType = 'CONTRACT_MFG' | 'INTERNAL' | 'MISC' | 'PASS_THROUGH'

export interface ParsedNode {
  level: 1 | 2
  sortIndex: number
  jobNumber: string | null
  partNumber: string | null
  description: string | null
  materialClass: MaterialClass
  componentType: string | null
  qtyNeeded: number | null
  uom: string | null
  customerProvided: boolean
  mfgComment: string | null
  etaDate: Date | null
  etaConfidence: EtaConfidence
  children: ParsedNode[]
  rawRow: Record<string, unknown>
}

export interface ParsedLine {
  customerPoNumber: string | null
  channelTag: string | null
  salesOrderNumber: string | null
  itemNumber: string | null
  custPartNumber: string | null
  description: string | null
  qtyOrdered: number | null
  qtyOrderedRaw: string | null
  qtyRemaining: number | null
  unitPrice: number | null
  valueSource: number | null
  valueComputed: number | null
  valueMismatch: boolean
  orderDate: Date | null
  shipDate: Date | null
  origRequiredDate: Date | null
  requiredDeliveryDate: Date | null
  workOrderNumber: string | null
  jobNumber: string | null
  fulfillmentType: FulfillmentType
  cmCode: string | null
  jobStatus: string | null
  comments: ParsedComment[]
  nodes: ParsedNode[]
  rawRow: Record<string, unknown>
  externalIds: Record<string, string>
}

export interface ParsedReport {
  reportType: OorFormat
  reportLabel: string
  asOfDate: Date | null
  lines: ParsedLine[]
  warnings: ParseWarning[]
}

export interface SourceInput {
  buffer?: Buffer
  filename?: string
  brandId: string
  orgId: string
}

/** The seam: an ERP or EDI feed replaces the file drop without touching the UI. */
export interface SourceAdapter {
  readonly key: string
  load(input: SourceInput): Promise<ParsedReport>
}
