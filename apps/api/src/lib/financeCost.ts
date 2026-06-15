// ─── Finance cost math helpers ──────────────────────────────
// Pure, defensive helpers for the Finance cost-aggregation hub.
// Every function is null-safe and never throws on absent cost fields:
// missing numbers coerce to 0, missing arrays to [], so the same code
// works against richly-quoted components and the sparse part-master seed.

/** Coerce anything to a finite number, defaulting to 0. Strips $ and commas
 *  so Product.retailPrice strings like "$9.99" parse cleanly. */
export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return fallback
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

/** Round to n decimals (default 4) for stable JSON output. */
export function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0
  const f = Math.pow(10, decimals)
  return Math.round(value * f) / f
}

// ─── MOQ tier shapes ────────────────────────────────────────
export interface MoqTier {
  moqQuantity?: number
  unitCost?: number
  toolingCost?: number
  sampleCost?: number
  shippingCostPerUnit?: number
  dutyRatePct?: number
  totalLandedCost?: number
  quoteReference?: string
}

/**
 * Landed unit cost for a single MOQ tier:
 *   unitCost + shippingCostPerUnit + unitCost * dutyRatePct/100
 *   + toolingCost amortized over moqQuantity (when qty > 0).
 * If a tier provides an explicit totalLandedCost it is preferred only when no
 * component fields are present (kept as fallback for pre-computed quotes).
 */
export function tierLandedUnitCost(tier: MoqTier | null | undefined): number {
  if (!tier || typeof tier !== 'object') return 0
  const unit = num(tier.unitCost)
  const shipping = num(tier.shippingCostPerUnit)
  const duty = unit * (num(tier.dutyRatePct) / 100)
  const qty = num(tier.moqQuantity)
  const toolingAmortized = qty > 0 ? num(tier.toolingCost) / qty : 0
  const computed = unit + shipping + duty + toolingAmortized
  // If we have no per-unit components but a pre-computed total exists, use it.
  if (computed === 0 && tier.totalLandedCost != null) return num(tier.totalLandedCost)
  return computed
}

/** Extract the moqTiers array from a COMPONENTS item's data, null-safe. */
export function getMoqTiers(data: Record<string, unknown> | null | undefined): MoqTier[] {
  if (!data) return []
  const tiers = (data as any).moqTiers
  return Array.isArray(tiers) ? (tiers as MoqTier[]) : []
}

/** Best (lowest) landed unit cost across a component's MOQ tiers.
 *  Returns null when the component carries no usable cost data. */
export function bestLandedUnitCost(
  data: Record<string, unknown> | null | undefined
): number | null {
  const tiers = getMoqTiers(data)
  if (tiers.length === 0) {
    // Fall back to a flat targetCostPerUnit if present.
    const target = data ? (data as any).targetCostPerUnit : null
    return target != null ? num(target) : null
  }
  let best: number | null = null
  for (const tier of tiers) {
    const landed = tierLandedUnitCost(tier)
    if (best === null || landed < best) best = landed
  }
  return best
}

// ─── Component lookup ───────────────────────────────────────
export interface ComponentItem {
  id: string
  data: Record<string, unknown>
}

/** Build a fast lookup of components by id AND by partNumber. */
export function indexComponents(components: ComponentItem[]): {
  byId: Map<string, ComponentItem>
  byPart: Map<string, ComponentItem>
} {
  const byId = new Map<string, ComponentItem>()
  const byPart = new Map<string, ComponentItem>()
  for (const c of components) {
    byId.set(c.id, c)
    const part = (c.data as any)?.partNumber
    if (typeof part === 'string' && part) byPart.set(part, c)
  }
  return { byId, byPart }
}

// ─── BOM roll-up ────────────────────────────────────────────
export interface BomLine {
  componentId?: string
  partNumber?: string
  description?: string
  um?: string
  supplier?: string
  partType?: string
}

export interface BomRollup {
  componentCost: number
  matchedLines: number
  totalLines: number
  /** lines that resolved to a component but had no cost data */
  costlessLines: number
}

/**
 * Roll up a BOM's component cost: for each line, resolve the component by
 * componentId (preferred) or partNumber, then add its best landed unit cost.
 * Lines that don't resolve or have no cost contribute 0 (tracked for the
 * `incomplete` flag).
 */
export function rollupBomComponentCost(
  lines: BomLine[] | null | undefined,
  index: { byId: Map<string, ComponentItem>; byPart: Map<string, ComponentItem> }
): BomRollup {
  const safeLines = Array.isArray(lines) ? lines : []
  let componentCost = 0
  let matchedLines = 0
  let costlessLines = 0
  for (const line of safeLines) {
    const comp =
      (line.componentId ? index.byId.get(line.componentId) : undefined) ??
      (line.partNumber ? index.byPart.get(line.partNumber) : undefined)
    if (!comp) continue
    matchedLines++
    const best = bestLandedUnitCost(comp.data)
    if (best == null || best === 0) {
      costlessLines++
      continue
    }
    componentCost += best
  }
  return { componentCost, matchedLines, totalLines: safeLines.length, costlessLines }
}

// ─── Formulation cost analysis ──────────────────────────────
// Mirrors apps/api/src/routes/formulationDetail.ts cost-analysis logic so the
// finance hub and the NPD detail view stay consistent.
export interface IngredientLike {
  inciName: string
  phase: string
  percentage: number
  costPerKg?: number | null
}

export interface CostAnalysis {
  totalCostPerKg: number
  breakdownByPhase: { phase: string; cost: number }[]
  top5CostDrivers: { inciName: string; phase: string; costContribution: number }[]
}

/**
 * total_cost_per_kg = sum over ingredients of (percentage/100 * costPerKg).
 * Returns zeros for a formulation with no ingredients.
 */
export function computeFormulationCost(ingredients: IngredientLike[] | null | undefined): CostAnalysis {
  const list = Array.isArray(ingredients) ? ingredients : []
  let totalCostPerKg = 0
  const costItems: { inciName: string; phase: string; costContribution: number }[] = []
  const phaseMap: Record<string, number> = {}

  for (const ing of list) {
    const pct = num(ing.percentage)
    const costPerKg = num(ing.costPerKg)
    const cost = (pct / 100) * costPerKg
    totalCostPerKg += cost
    costItems.push({ inciName: ing.inciName, phase: ing.phase, costContribution: cost })
    const phase = ing.phase || 'Unassigned'
    phaseMap[phase] = (phaseMap[phase] || 0) + cost
  }

  const breakdownByPhase = Object.entries(phaseMap).map(([phase, cost]) => ({
    phase,
    cost: round(cost),
  }))

  costItems.sort((a, b) => b.costContribution - a.costContribution)
  const top5CostDrivers = costItems.slice(0, 5).map((item) => ({
    inciName: item.inciName,
    phase: item.phase,
    costContribution: round(item.costContribution),
  }))

  return { totalCostPerKg: round(totalCostPerKg), breakdownByPhase, top5CostDrivers }
}
