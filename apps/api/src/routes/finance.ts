import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import {
  num,
  round,
  tierLandedUnitCost,
  getMoqTiers,
  bestLandedUnitCost,
  indexComponents,
  rollupBomComponentCost,
  computeFormulationCost,
  type ComponentItem,
  type BomLine,
} from '../lib/financeCost'

export const financeRoutes: ReturnType<typeof Router> = Router()

// ─── Internal loaders ───────────────────────────────────────
// Each loader pulls the live source-of-truth ModuleItems by module type,
// mirroring the read-aggregation style of routes/cms.ts. Cost overrides live
// in FINANCE_COSTING and are joined in by fgPartNumber.

async function loadComponents(): Promise<ComponentItem[]> {
  const items = await prisma.moduleItem.findMany({
    where: { module: { type: 'COMPONENTS' } },
  })
  return items.map((i) => ({ id: i.id, data: (i.data as Record<string, unknown>) || {} }))
}

interface BomItem {
  id: string
  data: Record<string, unknown>
}
async function loadBoms(): Promise<BomItem[]> {
  const items = await prisma.moduleItem.findMany({
    where: { module: { type: 'BILL_OF_MATERIALS' } },
  })
  return items.map((i) => ({ id: i.id, data: (i.data as Record<string, unknown>) || {} }))
}

interface FinanceOverride {
  fgPartNumber: string
  productName: string | null
  brand: string | null
  labelCost: number
  freightPerUnit: number
  overheadPerUnit: number
  targetMarginPct: number | null
  cogsOverride: number | null
  retailPrice: number | null
  notes: string | null
}
async function loadFinanceOverrides(): Promise<Map<string, FinanceOverride>> {
  const items = await prisma.moduleItem.findMany({
    where: { module: { type: 'FINANCE_COSTING' } },
  })
  const map = new Map<string, FinanceOverride>()
  for (const i of items) {
    const d = (i.data as Record<string, unknown>) || {}
    const fg = typeof d.fgPartNumber === 'string' ? d.fgPartNumber : null
    if (!fg) continue
    map.set(fg, {
      fgPartNumber: fg,
      productName: typeof d.productName === 'string' ? d.productName : null,
      brand: typeof d.brand === 'string' ? d.brand : null,
      labelCost: num(d.labelCost),
      freightPerUnit: num(d.freightPerUnit),
      overheadPerUnit: num(d.overheadPerUnit),
      targetMarginPct: d.targetMarginPct != null ? num(d.targetMarginPct) : null,
      cogsOverride: d.cogsOverride != null ? num(d.cogsOverride) : null,
      retailPrice: d.retailPrice != null ? num(d.retailPrice) : null,
      notes: typeof d.notes === 'string' ? d.notes : null,
    })
  }
  return map
}

// ─── 1. Component costs ─────────────────────────────────────
// One slim row per COMPONENTS item with its best (lowest) landed unit cost.
financeRoutes.get('/component-costs', async (_req: Request, res: Response) => {
  try {
    const components = await loadComponents()
    const rows = components
      .map((c) => {
        const data = c.data as any
        const tiers = getMoqTiers(data)
        return {
          id: c.id,
          partNumber: typeof data.partNumber === 'string' ? data.partNumber : null,
          name:
            typeof data.name === 'string'
              ? data.name
              : typeof data.component === 'string'
                ? data.component
                : null,
          type: typeof data.type === 'string' ? data.type : null,
          vendor: typeof data.vendor === 'string' ? data.vendor : null,
          targetCostPerUnit: data.targetCostPerUnit != null ? num(data.targetCostPerUnit) : null,
          bestLandedUnitCost: bestLandedUnitCost(data) != null ? round(bestLandedUnitCost(data) as number) : null,
          moqTierCount: tiers.length,
        }
      })
      .sort((a, b) => (a.partNumber || '').localeCompare(b.partNumber || ''))
    res.json(rows)
  } catch (error) {
    console.error('[finance] GET /component-costs error:', error)
    res.status(500).json({ error: 'Failed to fetch component costs' })
  }
})

// ─── 2. MOQ costs ───────────────────────────────────────────
// Flatten every component's moqTiers into individual rows with the computed
// landed unit cost (tooling amortized over moqQuantity).
financeRoutes.get('/moq-costs', async (_req: Request, res: Response) => {
  try {
    const components = await loadComponents()
    const rows: Array<{
      componentId: string
      partNumber: string | null
      name: string | null
      moqQuantity: number
      unitCost: number
      toolingCost: number
      shippingCostPerUnit: number
      dutyRatePct: number
      landedUnitCost: number
      quoteReference: string | null
    }> = []
    for (const c of components) {
      const data = c.data as any
      const partNumber = typeof data.partNumber === 'string' ? data.partNumber : null
      const name =
        typeof data.name === 'string'
          ? data.name
          : typeof data.component === 'string'
            ? data.component
            : null
      for (const tier of getMoqTiers(data)) {
        rows.push({
          componentId: c.id,
          partNumber,
          name,
          moqQuantity: num(tier.moqQuantity),
          unitCost: num(tier.unitCost),
          toolingCost: num(tier.toolingCost),
          shippingCostPerUnit: num(tier.shippingCostPerUnit),
          dutyRatePct: num(tier.dutyRatePct),
          landedUnitCost: round(tierLandedUnitCost(tier)),
          quoteReference: typeof tier.quoteReference === 'string' ? tier.quoteReference : null,
        })
      }
    }
    rows.sort((a, b) => {
      const p = (a.partNumber || '').localeCompare(b.partNumber || '')
      return p !== 0 ? p : a.moqQuantity - b.moqQuantity
    })
    res.json(rows)
  } catch (error) {
    console.error('[finance] GET /moq-costs error:', error)
    res.status(500).json({ error: 'Failed to fetch MOQ costs' })
  }
})

// ─── 3. Cost analysis (per formulation) ─────────────────────
// Reuses computeFormulationCost (same math as formulation-detail/cost-analysis).
financeRoutes.get('/cost-analysis', async (_req: Request, res: Response) => {
  try {
    const formulations = await prisma.moduleItem.findMany({
      where: { module: { type: 'FORMULATIONS' } },
    })
    const rows = await Promise.all(
      formulations.map(async (f) => {
        const data = (f.data as any) || {}
        const ingredients = await prisma.formulationIngredient.findMany({
          where: { formulationId: f.id },
          orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
        })
        const analysis = computeFormulationCost(ingredients)
        return {
          formulationId: f.id,
          productName:
            typeof data.product === 'string'
              ? data.product
              : typeof data.productName === 'string'
                ? data.productName
                : null,
          totalCostPerKg: analysis.totalCostPerKg,
          topDrivers: analysis.top5CostDrivers,
          byPhase: analysis.breakdownByPhase,
        }
      })
    )
    res.json(rows)
  } catch (error) {
    console.error('[finance] GET /cost-analysis error:', error)
    res.status(500).json({ error: 'Failed to compute cost analysis' })
  }
})

// ─── Shared product-cost roll-up ────────────────────────────
// Builds the finished-good COGS roll-up once, reused by /product-costs and
// /summary. One row per BOM (keyed by fgPartNumber) joined with its finance
// override; override-only rows with no matching BOM are also emitted.
interface ProductCostRow {
  fgPartNumber: string
  productName: string | null
  brand: string | null
  componentCost: number
  bulkCost: number
  labelCost: number
  freightPerUnit: number
  overheadPerUnit: number
  rolledCogs: number
  cogs: number
  retail: number | null
  marginPct: number | null
  targetMarginPct: number | null
  marginVsTarget: number | null
  incomplete: boolean
}

async function buildProductCosts(): Promise<ProductCostRow[]> {
  const [components, boms, overrides, formulations, products] = await Promise.all([
    loadComponents(),
    loadBoms(),
    loadFinanceOverrides(),
    prisma.moduleItem.findMany({ where: { module: { type: 'FORMULATIONS' } } }),
    prisma.product.findMany(),
  ])
  const index = indexComponents(components)

  // Pre-compute formulation costs once, keyed by both id and product name so a
  // BOM's bulk line can be linked best-effort.
  const formCostById = new Map<string, number>()
  const formCostByProduct = new Map<string, number>()
  for (const f of formulations) {
    const ings = await prisma.formulationIngredient.findMany({ where: { formulationId: f.id } })
    const cost = computeFormulationCost(ings).totalCostPerKg
    formCostById.set(f.id, cost)
    const product = (f.data as any)?.product
    if (typeof product === 'string' && product) formCostByProduct.set(product.toLowerCase(), cost)
  }

  // Product retail fallback by sku.
  const productRetailBySku = new Map<string, number>()
  for (const p of products) {
    if (p.sku && p.retailPrice != null) productRetailBySku.set(p.sku, num(p.retailPrice))
  }

  const rows: ProductCostRow[] = []
  const seenFg = new Set<string>()

  for (const bom of boms) {
    const data = bom.data as any
    const fg = typeof data.fgPartNumber === 'string' ? data.fgPartNumber : null
    if (!fg) continue
    seenFg.add(fg)
    const ov = overrides.get(fg)

    const rollup = rollupBomComponentCost(data.lines as BomLine[], index)

    // bulkCost: best-effort link. Try the BOM's bulk line description/product
    // against formulation product names; else 0.
    let bulkCost = 0
    const productName =
      (ov?.productName ?? (typeof data.productName === 'string' ? data.productName : null)) || null
    if (productName && formCostByProduct.has(productName.toLowerCase())) {
      bulkCost = formCostByProduct.get(productName.toLowerCase()) as number
    }

    const labelCost = ov?.labelCost ?? 0
    const freightPerUnit = ov?.freightPerUnit ?? 0
    const overheadPerUnit = ov?.overheadPerUnit ?? 0
    const rolledCogs = round(
      rollup.componentCost + bulkCost + labelCost + freightPerUnit + overheadPerUnit
    )
    const cogs = round(ov?.cogsOverride != null ? ov.cogsOverride : rolledCogs)

    const retail = ov?.retailPrice ?? productRetailBySku.get(fg) ?? null
    const marginPct = retail != null && retail > 0 ? round(((retail - cogs) / retail) * 100, 2) : null
    const targetMarginPct = ov?.targetMarginPct ?? null
    const marginVsTarget =
      targetMarginPct != null && marginPct != null ? round(marginPct - targetMarginPct, 2) : null

    // incomplete when no finance override OR component cost couldn't be sourced.
    const incomplete =
      !ov || rollup.matchedLines === 0 || rollup.componentCost === 0 || retail == null

    rows.push({
      fgPartNumber: fg,
      productName,
      brand: ov?.brand ?? (typeof data.brand === 'string' ? data.brand : null),
      componentCost: round(rollup.componentCost),
      bulkCost: round(bulkCost),
      labelCost: round(labelCost),
      freightPerUnit: round(freightPerUnit),
      overheadPerUnit: round(overheadPerUnit),
      rolledCogs,
      cogs,
      retail,
      marginPct,
      targetMarginPct,
      marginVsTarget,
      incomplete,
    })
  }

  // Override rows with no matching BOM still belong in the hub.
  for (const [fg, ov] of overrides) {
    if (seenFg.has(fg)) continue
    const rolledCogs = round(ov.labelCost + ov.freightPerUnit + ov.overheadPerUnit)
    const cogs = round(ov.cogsOverride != null ? ov.cogsOverride : rolledCogs)
    const retail = ov.retailPrice ?? productRetailBySku.get(fg) ?? null
    const marginPct = retail != null && retail > 0 ? round(((retail - cogs) / retail) * 100, 2) : null
    const targetMarginPct = ov.targetMarginPct
    const marginVsTarget =
      targetMarginPct != null && marginPct != null ? round(marginPct - targetMarginPct, 2) : null
    rows.push({
      fgPartNumber: fg,
      productName: ov.productName,
      brand: ov.brand,
      componentCost: 0,
      bulkCost: 0,
      labelCost: round(ov.labelCost),
      freightPerUnit: round(ov.freightPerUnit),
      overheadPerUnit: round(ov.overheadPerUnit),
      rolledCogs,
      cogs,
      retail,
      marginPct,
      targetMarginPct,
      marginVsTarget,
      incomplete: true, // no BOM → component cost unknown
    })
  }

  rows.sort((a, b) => a.fgPartNumber.localeCompare(b.fgPartNumber))
  return rows
}

// ─── 4. Product costs ───────────────────────────────────────
financeRoutes.get('/product-costs', async (_req: Request, res: Response) => {
  try {
    res.json(await buildProductCosts())
  } catch (error) {
    console.error('[finance] GET /product-costs error:', error)
    res.status(500).json({ error: 'Failed to compute product costs' })
  }
})

// ─── 5. Summary KPIs ────────────────────────────────────────
financeRoutes.get('/summary', async (_req: Request, res: Response) => {
  try {
    const rows = await buildProductCosts()
    const skuCount = rows.length

    const marginRows = rows.filter((r) => r.marginPct != null)
    const avgMarginPct =
      marginRows.length > 0
        ? round(marginRows.reduce((s, r) => s + (r.marginPct as number), 0) / marginRows.length, 2)
        : null

    const totalRolledCogs = round(rows.reduce((s, r) => s + r.rolledCogs, 0))

    const belowTargetCount = rows.filter(
      (r) => r.marginPct != null && r.targetMarginPct != null && r.marginPct < r.targetMarginPct
    ).length

    const topCostDrivers = [...rows]
      .sort((a, b) => b.cogs - a.cogs)
      .slice(0, 5)
      .map((r) => ({ fgPartNumber: r.fgPartNumber, productName: r.productName, cogs: r.cogs }))

    const unconfiguredCount = rows.filter((r) => r.incomplete).length

    res.json({
      skuCount,
      avgMarginPct,
      totalRolledCogs,
      belowTargetCount,
      topCostDrivers,
      unconfiguredCount,
    })
  } catch (error) {
    console.error('[finance] GET /summary error:', error)
    res.status(500).json({ error: 'Failed to compute finance summary' })
  }
})
