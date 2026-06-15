// Brand display helper for the SKU Pipeline + BOM flows.
// Seeded/ERP SKU items may store data.brand as a short code ('cd') or as a full
// brand name ("Carol's Daughter"). `brandLabel` resolves either form to the full
// display name; unknown values are returned title-cased so nothing renders blank.

const CODE_TO_NAME: Record<string, string> = {
  cd: "Carol's Daughter",
  ambi: 'Ambi',
  af: 'AcneFree',
  acnefree: 'AcneFree',
  derm: 'Dermablend',
  dermablend: 'Dermablend',
  baxter: 'Baxter of California',
}

/** Full brand names, used to populate form dropdowns. */
export const BRAND_OPTIONS: string[] = [
  "Carol's Daughter",
  'Ambi',
  'AcneFree',
  'Dermablend',
  'Baxter of California',
]

const KNOWN_NAMES = new Set(BRAND_OPTIONS.map((n) => n.toLowerCase()))

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Map a brand code or name to its full display name. Tolerant of both. */
export function brandLabel(b: string): string {
  if (!b) return ''
  const key = b.trim().toLowerCase()
  if (CODE_TO_NAME[key]) return CODE_TO_NAME[key]
  if (KNOWN_NAMES.has(key)) return BRAND_OPTIONS.find((n) => n.toLowerCase() === key)!
  // Already a full / unknown name — return as-is, title-cased for consistency.
  return titleCase(b.trim())
}
