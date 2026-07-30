// ─── Inventory health grading ────────────────────────────────
// Shared by every inventory source (the KarEve ERP sync and the Geodis feed
// import) so the same stock position is graded identically no matter which
// warehouse it came from. Previously these lived privately in erpSync.ts;
// they moved here when the second source arrived rather than being copied.

export type InventoryStatus = 'emergency' | 'critical' | 'healthy' | 'overstock'

// Preferred grading: how many months of demand the available stock covers.
export function statusFor(coverageMonths: number): InventoryStatus {
  if (coverageMonths <= 0) return 'emergency'
  if (coverageMonths < 1) return 'critical'
  if (coverageMonths > 20) return 'overstock'
  return 'healthy'
}

// Fallback when no demand figure is available to compute coverage: derive a
// coarse health signal from the available stock alone.
export function statusFromStock(available: number): InventoryStatus {
  if (available <= 0) return 'emergency'
  if (available < 250) return 'critical'
  if (available > 15000) return 'overstock'
  return 'healthy'
}

// Coverage in months, rounded to one decimal. Null when demand is unknown —
// callers fall back to statusFromStock in that case.
export function coverageFor(available: number, monthlyDemand: number): number | null {
  if (!(monthlyDemand > 0)) return null
  return Math.round((available / monthlyDemand) * 10) / 10
}

// Single entry point: grade a stock position, using coverage when demand is
// known and the stock-only heuristic otherwise.
export function gradeInventory(
  available: number,
  monthlyDemand: number | null | undefined,
): { coverageMonths: number | null; status: InventoryStatus } {
  const demand = Number(monthlyDemand ?? 0) || 0
  const coverageMonths = coverageFor(available, demand)
  return {
    coverageMonths,
    status: coverageMonths != null ? statusFor(coverageMonths) : statusFromStock(available),
  }
}
