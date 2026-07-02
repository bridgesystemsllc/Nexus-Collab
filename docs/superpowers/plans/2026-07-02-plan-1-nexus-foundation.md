# Plan 1 — Nexus Foundation: Data Model + Status Mapper + Read Endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Nexus a real relational home for production orders (`ProductionOrder`/`ProductionOrderLine`), a tested shared status/field mapper, and a `GET /api/v1/production-orders` endpoint — without disturbing the existing (still-working) production UI.

**Architecture:** All pure, DB-free logic (ERP↔Nexus status mapping, row→DTO shaping, manufacturer grouping, summary KPIs) lives in `@nexus/shared` and is unit-tested with Vitest. Prisma gains two models following the existing "String columns, no enums" convention. The API route is a thin Prisma query that delegates shaping to the shared pure functions. The legacy `ModuleItem`-based path is left intact so nothing breaks; Plan 2 switches the UI over.

**Tech Stack:** TypeScript, Prisma 5 (PostgreSQL), Express, Vitest, pnpm workspaces.

## Global Constraints

- **No Prisma enums.** Use `String` columns with allowed values documented in `//` comments (matches existing `schema.prisma`).
- **Identity:** `ProductionOrder.erpId` = ERP `advanced_purchase_orders.id` (UUID string); `poNumber` is `@unique`.
- **Synced fields only:** status, quantities, delivery dates, notes.
- **Quantities are integers** in Nexus (`qtyOrdered`, `qtyReceived`); `qtyRemaining` is always computed as `qtyOrdered - qtyReceived`, never stored, to avoid drift.
- **Status source of truth is the ERP `po_status` enum value** (e.g. `SENT_TO_VENDOR`); Nexus stores that raw value in `status` and derives label/color via the shared mapper.
- **Sync-meta fields** on every `ProductionOrder`: `lastSyncedAt`, `lastEditedSide` (`"NEXUS"|"ERP"`), `lastEditedAt`, `syncStatus` (`"SYNCED"|"PENDING"|"ERROR"`), `revisionHash`.
- Package manager is **pnpm**; run workspace commands with `pnpm --filter <pkg>`.
- A local Postgres must be running for migrate/seed steps (`docker-compose up -d` at repo root provides it; `DATABASE_URL` must be set in the environment / `.env`).

---

## File Structure

- Create: `packages/shared/vitest.config.ts` — Vitest config for the shared package.
- Modify: `packages/shared/package.json` — add `vitest` devDep + `test` script.
- Create: `packages/shared/src/productionStatus.ts` — ERP↔Nexus status mapper.
- Create: `packages/shared/src/productionStatus.test.ts` — mapper tests.
- Create: `packages/shared/src/productionOrder.ts` — `ProductionOrderDTO` + pure shapers.
- Create: `packages/shared/src/productionOrder.test.ts` — shaper tests.
- Modify: `packages/shared/src/index.ts` — re-export the two new modules.
- Modify: `packages/prisma/prisma/schema.prisma` — add `ProductionOrder` + `ProductionOrderLine`.
- Create (generated): `packages/prisma/prisma/migrations/*_add_production_orders/` — migration.
- Modify: `packages/prisma/prisma/seed.ts` — seed a few `ProductionOrder` rows.
- Create: `apps/api/src/routes/production.ts` — `GET /production-orders`.
- Modify: `apps/api/src/index.ts` — mount the production router.

---

### Task 1: Bootstrap Vitest in `@nexus/shared`

**Files:**
- Modify: `packages/shared/package.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/smoke.test.ts` (temporary — deleted at end of task)

**Interfaces:**
- Produces: a working `pnpm --filter @nexus/shared test` command that runs `*.test.ts` under `src/`.

- [ ] **Step 1: Add the failing smoke test**

Create `packages/shared/src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to verify the harness is missing**

Run: `pnpm --filter @nexus/shared test`
Expected: FAIL — no `test` script / `vitest: command not found`.

- [ ] **Step 3: Add vitest + test script**

Add `vitest` to devDependencies and a `test` script in `packages/shared/package.json`:

```json
{
  "name": "@nexus/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Install and run the smoke test**

Run: `pnpm install && pnpm --filter @nexus/shared test`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Remove the smoke test and commit**

```bash
rm packages/shared/src/smoke.test.ts
git add packages/shared/package.json packages/shared/vitest.config.ts pnpm-lock.yaml
git commit -m "test: bootstrap vitest in @nexus/shared"
```

---

### Task 2: Status mapper (`productionStatus.ts`)

**Files:**
- Create: `packages/shared/src/productionStatus.ts`
- Test: `packages/shared/src/productionStatus.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `type ErpPoStatus` — the 13 ERP `po_status` values.
  - `interface StatusDisplay { label: string; colorVar: string }`
  - `erpStatusToDisplay(status: string): StatusDisplay` — maps any string, falling back to `{ label: 'Unknown', colorVar: '--text-tertiary' }`.
  - `displayLabelToErpStatus(label: string): ErpPoStatus | null` — reverse lookup (case-insensitive), `null` if unknown.
  - `ERP_PO_STATUSES: readonly ErpPoStatus[]` — the ordered list.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/productionStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  erpStatusToDisplay,
  displayLabelToErpStatus,
  ERP_PO_STATUSES,
} from './productionStatus'

describe('erpStatusToDisplay', () => {
  it('maps a known status to label + color token', () => {
    expect(erpStatusToDisplay('SENT_TO_VENDOR')).toEqual({
      label: 'Sent to Vendor',
      colorVar: '--info',
    })
    expect(erpStatusToDisplay('IN_PRODUCTION')).toEqual({
      label: 'In Production',
      colorVar: '--accent',
    })
    expect(erpStatusToDisplay('RECEIVED')).toEqual({
      label: 'Received',
      colorVar: '--success',
    })
    expect(erpStatusToDisplay('CANCELLED')).toEqual({
      label: 'Cancelled',
      colorVar: '--danger',
    })
  })

  it('falls back to Unknown for unmapped values', () => {
    expect(erpStatusToDisplay('WAT')).toEqual({
      label: 'Unknown',
      colorVar: '--text-tertiary',
    })
    expect(erpStatusToDisplay('')).toEqual({
      label: 'Unknown',
      colorVar: '--text-tertiary',
    })
  })
})

describe('displayLabelToErpStatus', () => {
  it('reverse-maps a label (case-insensitive) to the ERP enum', () => {
    expect(displayLabelToErpStatus('Sent to Vendor')).toBe('SENT_TO_VENDOR')
    expect(displayLabelToErpStatus('in production')).toBe('IN_PRODUCTION')
  })

  it('returns null for an unknown label', () => {
    expect(displayLabelToErpStatus('Nope')).toBeNull()
  })
})

describe('ERP_PO_STATUSES', () => {
  it('lists all 13 statuses', () => {
    expect(ERP_PO_STATUSES).toHaveLength(13)
    expect(ERP_PO_STATUSES).toContain('DRAFT')
    expect(ERP_PO_STATUSES).toContain('CLOSED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexus/shared test`
Expected: FAIL — cannot find module `./productionStatus`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/productionStatus.ts`:

```ts
// ─── ERP ↔ Nexus production status mapping ──────────────────
// Source of truth is the ERP `po_status` pgEnum
// (AmbiSyncOperations-V2/shared/schema.ts). Nexus stores the raw ERP value
// and derives display label + color token here.

export type ErpPoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT_TO_VENDOR'
  | 'ACKNOWLEDGED'
  | 'IN_PRODUCTION'
  | 'COMPLETE_PRODUCTION'
  | 'SHIPPED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

export interface StatusDisplay {
  label: string
  colorVar: string
}

const MAP: Record<ErpPoStatus, StatusDisplay> = {
  DRAFT: { label: 'Draft', colorVar: '--text-tertiary' },
  SUBMITTED: { label: 'Submitted', colorVar: '--info' },
  PENDING_APPROVAL: { label: 'Pending Approval', colorVar: '--warning' },
  APPROVED: { label: 'Approved', colorVar: '--info' },
  SENT_TO_VENDOR: { label: 'Sent to Vendor', colorVar: '--info' },
  ACKNOWLEDGED: { label: 'Acknowledged', colorVar: '--accent' },
  IN_PRODUCTION: { label: 'In Production', colorVar: '--accent' },
  COMPLETE_PRODUCTION: { label: 'Production Complete', colorVar: '--success' },
  SHIPPED: { label: 'Shipped', colorVar: '--success' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', colorVar: '--warning' },
  RECEIVED: { label: 'Received', colorVar: '--success' },
  CLOSED: { label: 'Closed', colorVar: '--text-tertiary' },
  CANCELLED: { label: 'Cancelled', colorVar: '--danger' },
}

const UNKNOWN: StatusDisplay = { label: 'Unknown', colorVar: '--text-tertiary' }

export const ERP_PO_STATUSES = Object.keys(MAP) as ErpPoStatus[]

export function erpStatusToDisplay(status: string): StatusDisplay {
  return MAP[status as ErpPoStatus] ?? UNKNOWN
}

export function displayLabelToErpStatus(label: string): ErpPoStatus | null {
  const target = label.trim().toLowerCase()
  for (const status of ERP_PO_STATUSES) {
    if (MAP[status].label.toLowerCase() === target) return status
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nexus/shared test`
Expected: PASS — all `productionStatus` tests green.

- [ ] **Step 5: Re-export from the package index**

Append to `packages/shared/src/index.ts`:

```ts

// ─── Production tracking (ERP sync) ─────────────────────────
export * from './productionStatus'
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/productionStatus.ts packages/shared/src/productionStatus.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): ERP<->Nexus production status mapper"
```

---

### Task 3: ProductionOrder DTO + pure shapers (`productionOrder.ts`)

**Files:**
- Create: `packages/shared/src/productionOrder.ts`
- Test: `packages/shared/src/productionOrder.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `erpStatusToDisplay` from `./productionStatus`.
- Produces:
  - `interface ProductionOrderRow` — the raw shape read from Prisma (fields used by shapers).
  - `interface ProductionOrderDTO` — API/UI shape (adds `statusLabel`, `statusColor`, `qtyRemaining`).
  - `toProductionOrderDTO(row: ProductionOrderRow): ProductionOrderDTO`
  - `interface ManufacturerGroup { manufacturer: string; count: number; unitsRemaining: number; orders: ProductionOrderDTO[] }`
  - `groupByManufacturer(orders: ProductionOrderDTO[]): ManufacturerGroup[]` — sorted by `unitsRemaining` desc.
  - `interface ProductionSummary { activePOs: number; lineItems: number; unitsToReceive: number; receivedToDate: number; pastDue: number }`
  - `computeSummary(orders: ProductionOrderDTO[], now: Date): ProductionSummary`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/productionOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toProductionOrderDTO,
  groupByManufacturer,
  computeSummary,
  type ProductionOrderRow,
} from './productionOrder'

function row(overrides: Partial<ProductionOrderRow> = {}): ProductionOrderRow {
  return {
    id: 'n1',
    erpId: 'e1',
    poNumber: 'P0001',
    manufacturer: 'Paklab',
    brand: null,
    status: 'SENT_TO_VENDOR',
    urgency: 'NORMAL',
    orderDate: '2026-06-21',
    deliveryDue: '2026-11-29',
    eta: '2026-11-29',
    qtyOrdered: 100000,
    qtyReceived: 20000,
    lineCount: 2,
    notes: null,
    progress: 0,
    value: 0,
    syncStatus: 'SYNCED',
    lastSyncedAt: null,
    ...overrides,
  }
}

describe('toProductionOrderDTO', () => {
  it('adds label, color, and computed remaining', () => {
    const dto = toProductionOrderDTO(row())
    expect(dto.statusLabel).toBe('Sent to Vendor')
    expect(dto.statusColor).toBe('--info')
    expect(dto.qtyRemaining).toBe(80000)
  })

  it('never returns a negative remaining', () => {
    const dto = toProductionOrderDTO(row({ qtyOrdered: 100, qtyReceived: 250 }))
    expect(dto.qtyRemaining).toBe(0)
  })
})

describe('groupByManufacturer', () => {
  it('groups, counts, and sums remaining, sorted by unitsRemaining desc', () => {
    const orders = [
      toProductionOrderDTO(row({ id: 'a', manufacturer: 'Paklab', qtyOrdered: 100, qtyReceived: 0 })),
      toProductionOrderDTO(row({ id: 'b', manufacturer: 'Twincraft', qtyOrdered: 500, qtyReceived: 0 })),
      toProductionOrderDTO(row({ id: 'c', manufacturer: 'Paklab', qtyOrdered: 50, qtyReceived: 0 })),
    ]
    const groups = groupByManufacturer(orders)
    expect(groups.map((g) => g.manufacturer)).toEqual(['Twincraft', 'Paklab'])
    const paklab = groups.find((g) => g.manufacturer === 'Paklab')!
    expect(paklab.count).toBe(2)
    expect(paklab.unitsRemaining).toBe(150)
  })
})

describe('computeSummary', () => {
  it('computes KPIs including past-due against now', () => {
    const now = new Date('2026-07-02T00:00:00Z')
    const orders = [
      toProductionOrderDTO(row({ id: 'a', qtyOrdered: 100, qtyReceived: 40, lineCount: 2, deliveryDue: '2026-06-01' })),
      toProductionOrderDTO(row({ id: 'b', qtyOrdered: 200, qtyReceived: 0, lineCount: 3, deliveryDue: '2026-12-01' })),
    ]
    const s = computeSummary(orders, now)
    expect(s.activePOs).toBe(2)
    expect(s.lineItems).toBe(5)
    expect(s.unitsToReceive).toBe(260) // (100-40) + (200-0)
    expect(s.receivedToDate).toBe(40)
    expect(s.pastDue).toBe(1) // only order 'a' is past 2026-07-02
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nexus/shared test`
Expected: FAIL — cannot find module `./productionOrder`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/productionOrder.ts`:

```ts
// ─── ProductionOrder DTO + pure shapers ─────────────────────
import { erpStatusToDisplay } from './productionStatus'

export interface ProductionOrderRow {
  id: string
  erpId: string | null
  poNumber: string
  manufacturer: string
  brand: string | null
  status: string
  urgency: string
  orderDate: string | null
  deliveryDue: string | null
  eta: string | null
  qtyOrdered: number
  qtyReceived: number
  lineCount: number
  notes: string | null
  progress: number
  value: number
  syncStatus: string
  lastSyncedAt: string | null
}

export interface ProductionOrderDTO extends ProductionOrderRow {
  statusLabel: string
  statusColor: string
  qtyRemaining: number
}

export function toProductionOrderDTO(row: ProductionOrderRow): ProductionOrderDTO {
  const { label, colorVar } = erpStatusToDisplay(row.status)
  const qtyRemaining = Math.max(0, row.qtyOrdered - row.qtyReceived)
  return { ...row, statusLabel: label, statusColor: colorVar, qtyRemaining }
}

export interface ManufacturerGroup {
  manufacturer: string
  count: number
  unitsRemaining: number
  orders: ProductionOrderDTO[]
}

export function groupByManufacturer(orders: ProductionOrderDTO[]): ManufacturerGroup[] {
  const byName = new Map<string, ProductionOrderDTO[]>()
  for (const o of orders) {
    const key = o.manufacturer || 'Unassigned'
    const list = byName.get(key) ?? []
    list.push(o)
    byName.set(key, list)
  }
  const groups: ManufacturerGroup[] = []
  for (const [manufacturer, list] of byName) {
    groups.push({
      manufacturer,
      count: list.length,
      unitsRemaining: list.reduce((sum, o) => sum + o.qtyRemaining, 0),
      orders: list,
    })
  }
  groups.sort((a, b) => b.unitsRemaining - a.unitsRemaining)
  return groups
}

export interface ProductionSummary {
  activePOs: number
  lineItems: number
  unitsToReceive: number
  receivedToDate: number
  pastDue: number
}

export function computeSummary(orders: ProductionOrderDTO[], now: Date): ProductionSummary {
  let lineItems = 0
  let unitsToReceive = 0
  let receivedToDate = 0
  let pastDue = 0
  for (const o of orders) {
    lineItems += o.lineCount
    unitsToReceive += o.qtyRemaining
    receivedToDate += o.qtyReceived
    if (o.deliveryDue && o.qtyRemaining > 0 && new Date(o.deliveryDue) < now) {
      pastDue += 1
    }
  }
  return {
    activePOs: orders.length,
    lineItems,
    unitsToReceive,
    receivedToDate,
    pastDue,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nexus/shared test`
Expected: PASS — all `productionOrder` tests green.

- [ ] **Step 5: Re-export from the package index**

Append to `packages/shared/src/index.ts`:

```ts
export * from './productionOrder'
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/productionOrder.ts packages/shared/src/productionOrder.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): ProductionOrder DTO + grouping/summary shapers"
```

---

### Task 4: Prisma models + migration

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma`
- Create (generated): `packages/prisma/prisma/migrations/*_add_production_orders/migration.sql`

**Interfaces:**
- Produces: `ProductionOrder` + `ProductionOrderLine` tables and a regenerated Prisma client. Later tasks/plans query `prisma.productionOrder`.

- [ ] **Step 1: Add the models to the schema**

Append to `packages/prisma/prisma/schema.prisma` (place after the `SyncLog` model, ~line 306):

```prisma
// ─── Production Orders (ERP-synced) ─────────────────────────
model ProductionOrder {
  id            String   @id @default(cuid())
  erpId         String?  @unique // advanced_purchase_orders.id (UUID) in KarEve ERP
  poNumber      String   @unique
  manufacturer  String   @default("Unassigned")
  brand         String?
  status        String   @default("DRAFT") // ERP po_status enum value (see @nexus/shared productionStatus)
  urgency       String   @default("NORMAL") // LOW, NORMAL, HIGH, CRITICAL
  orderDate     DateTime?
  deliveryDue   DateTime?
  eta           DateTime?
  qtyOrdered    Int      @default(0)
  qtyReceived   Int      @default(0)
  notes         String?
  progress      Int      @default(0)
  value         Float    @default(0)

  // Sync metadata
  lastSyncedAt   DateTime?
  lastEditedSide String    @default("ERP") // NEXUS or ERP
  lastEditedAt   DateTime  @default(now())
  syncStatus     String    @default("SYNCED") // SYNCED, PENDING, ERROR
  revisionHash   String?

  orgId String
  org   Organization @relation(fields: [orgId], references: [id])
  lines ProductionOrderLine[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([orgId])
  @@index([manufacturer])
  @@index([status])
}

model ProductionOrderLine {
  id                String   @id @default(cuid())
  productionOrderId String
  productionOrder   ProductionOrder @relation(fields: [productionOrderId], references: [id], onDelete: Cascade)
  erpLineId         String?  // advanced_purchase_order_lines.id (UUID)
  sku               String?
  description       String?
  qtyOrdered        Int      @default(0)
  qtyReceived       Int      @default(0)
  lineStatus        String   @default("OPEN") // OPEN, PARTIAL, COMPLETE, CANCELLED

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([productionOrderId])
}
```

- [ ] **Step 2: Add the back-relation on `Organization`**

Find the `Organization` model in `packages/prisma/prisma/schema.prisma` and add this line alongside its other relation fields (e.g. next to `integrations Integration[]`):

```prisma
  productionOrders ProductionOrder[]
```

- [ ] **Step 3: Ensure the database is running**

Run (from repo root): `docker-compose up -d`
Expected: a `postgres` container is up. Confirm `DATABASE_URL` is set (check `.env` or the shell). Run `echo $DATABASE_URL` — expect a non-empty `postgresql://...` URL.

- [ ] **Step 4: Create and apply the migration**

Run: `pnpm --filter @nexus/prisma exec prisma migrate dev --name add_production_orders`
Expected: Prisma creates `migrations/<timestamp>_add_production_orders/migration.sql`, applies it, and regenerates the client with no errors. The output ends with "Your database is now in sync with your schema."

- [ ] **Step 5: Verify the client typechecks the new model**

Run: `pnpm --filter @nexus/prisma exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀".

- [ ] **Step 6: Commit**

```bash
git add packages/prisma/prisma/schema.prisma packages/prisma/prisma/migrations
git commit -m "feat(prisma): add ProductionOrder + ProductionOrderLine models"
```

---

### Task 5: Seed production orders

**Files:**
- Modify: `packages/prisma/prisma/seed.ts`

**Interfaces:**
- Consumes: the `org` created earlier in the seed script; `prisma.productionOrder`.
- Produces: a handful of `ProductionOrder` rows so the API/UI has real data.

- [ ] **Step 1: Add the seed block**

In `packages/prisma/prisma/seed.ts`, after the `Integration` seed block (~line 199), add:

```ts
  // ─── Production Orders (ERP-synced sample) ────────────────
  const productionOrders = [
    { poNumber: 'P06222026', manufacturer: 'Paklab', status: 'SENT_TO_VENDOR', urgency: 'NORMAL', orderDate: new Date('2026-06-21'), deliveryDue: new Date('2026-11-29'), qtyOrdered: 100000, qtyReceived: 0, value: 0 },
    { poNumber: 'PK05272026', manufacturer: 'Paklab', status: 'ACKNOWLEDGED', urgency: 'NORMAL', orderDate: new Date('2026-05-25'), deliveryDue: new Date('2026-11-19'), qtyOrdered: 50000, qtyReceived: 0, value: 0 },
    { poNumber: 'P05282026', manufacturer: 'Twincraft', status: 'SENT_TO_VENDOR', urgency: 'NORMAL', orderDate: new Date('2026-05-25'), deliveryDue: new Date('2026-12-14'), qtyOrdered: 100000, qtyReceived: 0, value: 0 },
    { poNumber: 'P03172026', manufacturer: 'Glenmark', status: 'IN_PRODUCTION', urgency: 'HIGH', orderDate: new Date('2026-03-15'), deliveryDue: new Date('2026-08-06'), qtyOrdered: 75000, qtyReceived: 30000, value: 0 },
    { poNumber: 'P02192026', manufacturer: 'Cosmax', status: 'PARTIALLY_RECEIVED', urgency: 'NORMAL', orderDate: new Date('2026-02-11'), deliveryDue: new Date('2026-06-13'), qtyOrdered: 42000, qtyReceived: 20000, value: 0 },
  ]

  for (const po of productionOrders) {
    await prisma.productionOrder.upsert({
      where: { poNumber: po.poNumber },
      update: {},
      create: {
        ...po,
        eta: po.deliveryDue,
        orgId: org.id,
        lastEditedSide: 'ERP',
        syncStatus: 'SYNCED',
        lines: {
          create: [
            { sku: `${po.poNumber}-L1`, description: 'Seeded line', qtyOrdered: po.qtyOrdered, qtyReceived: po.qtyReceived, lineStatus: 'OPEN' },
          ],
        },
      },
    })
  }
  console.log(`Seeded ${productionOrders.length} production orders`)
```

> Note: if the seed script's org variable is not named `org`, use whatever the existing `Integration` seed uses for `orgId` — grep the file for `orgId:` to confirm.

- [ ] **Step 2: Run the seed**

Run: `pnpm --filter @nexus/prisma exec tsx prisma/seed.ts`
Expected: log line "Seeded 5 production orders" and no errors.

- [ ] **Step 3: Verify rows exist**

Run: `pnpm --filter @nexus/prisma exec prisma studio` (opens Studio), or query directly:
`docker-compose exec -T postgres psql "$DATABASE_URL" -c 'select po_number, manufacturer, status, qty_ordered from "ProductionOrder" order by manufacturer;'`
Expected: 5 rows across Paklab (2), Twincraft, Glenmark, Cosmax.

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/prisma/seed.ts
git commit -m "feat(prisma): seed sample production orders"
```

---

### Task 6: `GET /api/v1/production-orders` endpoint

**Files:**
- Create: `apps/api/src/routes/production.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `toProductionOrderDTO`, `groupByManufacturer`, `computeSummary` from `@nexus/shared`; the shared `prisma` client used by other routes in `apps/api/src`.
- Produces: `GET /api/v1/production-orders` returning `{ orders: ProductionOrderDTO[], groups: ManufacturerGroup[], summary: ProductionSummary }`.

- [ ] **Step 1: Create the route**

The shared Prisma client is exported from `apps/api/src/index.ts` and imported by routes as `import { prisma } from '../index'` (this is the same pattern `apps/api/src/routes/departments.ts:3` uses; the circular import is fine because `prisma` is constructed before routers are mounted).

Create `apps/api/src/routes/production.ts`:

```ts
import { Router, Request, Response } from 'express'
import {
  toProductionOrderDTO,
  groupByManufacturer,
  computeSummary,
  type ProductionOrderRow,
} from '@nexus/shared'
import { prisma } from '../index'

export const productionRoutes = Router()

function toIso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

// ─── List production orders (shaped for the ops UI) ─────────
productionRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.productionOrder.findMany({
      orderBy: { orderDate: 'desc' },
      include: { _count: { select: { lines: true } } },
    })

    const dtos = rows.map((r) => {
      const row: ProductionOrderRow = {
        id: r.id,
        erpId: r.erpId,
        poNumber: r.poNumber,
        manufacturer: r.manufacturer,
        brand: r.brand,
        status: r.status,
        urgency: r.urgency,
        orderDate: toIso(r.orderDate),
        deliveryDue: toIso(r.deliveryDue),
        eta: toIso(r.eta),
        qtyOrdered: r.qtyOrdered,
        qtyReceived: r.qtyReceived,
        lineCount: r._count.lines,
        notes: r.notes,
        progress: r.progress,
        value: r.value,
        syncStatus: r.syncStatus,
        lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      }
      return toProductionOrderDTO(row)
    })

    res.json({
      orders: dtos,
      groups: groupByManufacturer(dtos),
      summary: computeSummary(dtos, new Date()),
    })
  } catch (error) {
    console.error('[production] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch production orders' })
  }
})
```

- [ ] **Step 2: Mount the router**

In `apps/api/src/index.ts`, alongside the other `api.use('/...', ...)` lines (near `api.use('/departments', departmentRoutes)` at ~line 50), add the import at the top and the mount:

```ts
import { productionRoutes } from './routes/production'
```

```ts
api.use('/production-orders', productionRoutes)
```

- [ ] **Step 3: Typecheck the API**

Run: `pnpm --filter @nexus/api exec tsc --noEmit`
Expected: no type errors (the `@nexus/shared` exports resolve; Prisma `productionOrder` is typed).

- [ ] **Step 4: Verify the endpoint returns seeded data**

Start the API (`pnpm --filter @nexus/api dev` in one shell — it logs `⚡ NEXUS API running on http://localhost:3000`), then in another:
Run: `curl -s http://localhost:3000/api/v1/production-orders | head -c 600`
Expected: JSON with `orders` (5 items, each having `statusLabel`, `statusColor`, `qtyRemaining`), a `groups` array led by the largest `unitsRemaining`, and a `summary` object with `activePOs: 5`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/production.ts apps/api/src/index.ts
git commit -m "feat(api): GET /production-orders backed by ProductionOrder tables"
```

---

## Definition of Done (Plan 1)

- `pnpm --filter @nexus/shared test` passes (mapper + shaper suites).
- `prisma migrate dev` applied; `ProductionOrder`/`ProductionOrderLine` exist and are seeded.
- `GET /api/v1/production-orders` returns shaped DTOs + groups + summary from real rows.
- The existing production UI (`ProductionTab` via `ModuleItem`) is untouched and still renders — no regression. (Plan 2 migrates the UI to the new endpoint.)
