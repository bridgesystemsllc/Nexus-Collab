// Bill of Materials — shared types + mappers.
// A BOM is stored as a ModuleItem (type BILL_OF_MATERIALS) whose JSON `data`
// holds the header fields + an ordered `lines[]` array. Each line references a
// Component (part master) by id and snapshots the part number / description /
// supplier / UM at save time so an exported BOM never changes if the Component
// is later edited (PLM version stability).

export type BomStatus = 'draft' | 'active' | 'archived'

export type PartType =
  | 'bulk' | 'bottle' | 'cap' | 'tube' | 'carton'
  | 'label' | 'shipper' | 'divider' | 'shrinkwrap' | 'other'

export const PART_TYPES: PartType[] = [
  'bulk', 'bottle', 'cap', 'tube', 'carton', 'label', 'shipper', 'divider', 'shrinkwrap', 'other',
]

export interface BomLine {
  lineNo: number
  /** Component ModuleItem id this line references (null if free-typed / legacy). */
  componentId: string | null
  /** Snapshot of the component part number at save time. */
  partNumber: string
  /** Snapshot of the description as printed. */
  description: string
  /** Unit/qty per finished good. Numeric like "1", or "-" for pack-level items. Kept as string to preserve "-". */
  um: string
  /** Snapshot of the supplier name as printed. */
  supplier: string
  partType: PartType
}

export interface Bom {
  brand: string
  /** Finished-good SKU, e.g. K8120000 */
  fgPartNumber: string
  productName: string
  fillClaim: string
  minFill: string
  /** FILLER(S) supplier code, e.g. ACT */
  fillerSupplier: string
  /** Quoted bulk fill name (printed bold/blue), e.g. "CD LK SCALP & EDGE BALANCING SERUM 2OZ" */
  fillerName: string
  caseQty: number | null
  innerPack: string
  overUnderTolerance: string
  launchPriority: number | null
  status: BomStatus
  version: number
  lines: BomLine[]
}

/** A BOM as it lives in the API: the ModuleItem wrapper + typed data. */
export interface BomItem {
  id: string
  moduleId?: string
  status?: string | null
  data: Bom
}

export function emptyBom(): Bom {
  return {
    brand: "Carol's Daughter",
    fgPartNumber: '',
    productName: '',
    fillClaim: '',
    minFill: 'Legal fill claim',
    fillerSupplier: 'ACT',
    fillerName: '',
    caseQty: null,
    innerPack: '3 eaches per',
    overUnderTolerance: '[+ or – 8%]',
    launchPriority: null,
    status: 'draft',
    version: 1,
    lines: [emptyLine(1, 'bulk', 'ACT')],
  }
}

export function emptyLine(lineNo: number, partType: PartType = 'other', supplier = ''): BomLine {
  return { lineNo, componentId: null, partNumber: '', description: '', um: partType === 'shrinkwrap' ? '-' : '1', supplier, partType }
}

/** Normalize a raw ModuleItem (data may be partial / legacy) into a typed BOM. */
export function bomFromItem(item: any): BomItem {
  const d = (item?.data ?? {}) as Partial<Bom>
  const lines: BomLine[] = Array.isArray(d.lines)
    ? d.lines.map((l: any, i: number) => ({
        lineNo: typeof l.lineNo === 'number' ? l.lineNo : i + 1,
        componentId: l.componentId ?? null,
        partNumber: l.partNumber ?? '',
        description: l.description ?? '',
        um: l.um != null ? String(l.um) : '',
        supplier: l.supplier ?? '',
        partType: (l.partType as PartType) ?? 'other',
      }))
    : []
  return {
    id: item?.id,
    moduleId: item?.moduleId,
    status: item?.status,
    data: {
      brand: d.brand ?? "Carol's Daughter",
      fgPartNumber: d.fgPartNumber ?? '',
      productName: d.productName ?? '',
      fillClaim: d.fillClaim ?? '',
      minFill: d.minFill ?? '',
      fillerSupplier: d.fillerSupplier ?? '',
      fillerName: d.fillerName ?? '',
      caseQty: d.caseQty ?? null,
      innerPack: d.innerPack ?? '',
      overUnderTolerance: d.overUnderTolerance ?? '',
      launchPriority: d.launchPriority ?? null,
      status: (d.status as BomStatus) ?? 'draft',
      version: d.version ?? 1,
      lines,
    },
  }
}

/** A short, filesystem/sheet-safe name derived from the product (e.g. "BalancingSerum"). */
export function bomShortName(bom: Bom): string {
  const name = bom.productName || bom.fgPartNumber || 'BOM'
  // Take the distinctive tail of the marketing name (after "Care ") if present.
  const afterCare = name.split(/care\s+/i).pop() || name
  const cleaned = afterCare.replace(/\d+\s*oz/gi, '').replace(/[^A-Za-z0-9]+/g, ' ').trim()
  const camel = cleaned.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  return camel || 'BOM'
}
