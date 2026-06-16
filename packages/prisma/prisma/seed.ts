// prisma/seed.ts
// Run: pnpm prisma db seed
// Add to package.json: "prisma": { "seed": "tsx prisma/seed.ts" }

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding NEXUS database...\n')

  // ─── Organization
  const org = await prisma.organization.create({ data: { name: 'Kareve Beauty Group', slug: 'kareve-beauty' } })
  console.log('✅ Org:', org.name)

  // ─── Brands
  const [cd, ambi, af] = await Promise.all([
    prisma.brand.create({ data: { name: "Carol's Daughter", color: '#BF5AF2', icon: '◇', orgId: org.id } }),
    prisma.brand.create({ data: { name: 'Ambi', color: '#FF9F0A', icon: '◆', orgId: org.id } }),
    prisma.brand.create({ data: { name: 'AcneFree', color: '#32D74B', icon: '○', orgId: org.id } }),
  ])
  console.log('✅ Brands: 3')

  // ─── Departments
  const rd = await prisma.department.create({ data: { name: 'R&D', description: 'Formulations, briefs, tech transfers, CM coordination', icon: '⚗', color: '#BF5AF2', type: 'BUILTIN_RD', orgId: org.id } })
  const ops = await prisma.department.create({ data: { name: 'Operations', description: 'SKU pipeline, inventory, production tracking', icon: '⚙', color: '#7C3AED', type: 'BUILTIN_OPS', orgId: org.id } })
  const wh = await prisma.department.create({ data: { name: 'Warehouse', description: 'Receiving, shipping, inventory', icon: '📦', color: '#32D74B', type: 'CUSTOM', orgId: org.id } })
  // Vendor Mgmt is archived — its responsibilities now live under CM Productivity (R&D + Finance). Data preserved.
  const vm = await prisma.department.create({ data: { name: 'Vendor Mgmt', description: 'Vendor relationships, MOQ, PO management', icon: '🤝', color: '#E8948A', type: 'CUSTOM', archived: true, orgId: org.id } })
  const fin = await prisma.department.create({ data: { name: 'Finance', description: 'COGS, cost analysis, component & MOQ costing', icon: '📊', color: '#00C7FF', type: 'BUILTIN_FINANCE', orgId: org.id } })
  // Sales + Marketing are archived stubs (no modules surfaced) — kept for data/members but hidden from nav.
  const sales = await prisma.department.create({ data: { name: 'Sales', description: 'Customer demand, account signals, revenue follow-up', icon: '📈', color: '#32D74B', type: 'CUSTOM', archived: true, orgId: org.id } })
  const marketing = await prisma.department.create({ data: { name: 'Marketing', description: 'Launch assets, retail stories, campaign readiness', icon: '📣', color: '#BF5AF2', type: 'CUSTOM', archived: true, orgId: org.id } })
  console.log('✅ Departments: 7')

  // ─── Modules
  const briefsMod = await prisma.departmentModule.create({ data: { name: 'Active Briefs', type: 'BRIEFS', departmentId: rd.id, sortOrder: 0 } })
  const cmMod = await prisma.departmentModule.create({ data: { name: 'CM Productivity', type: 'CM_PRODUCTIVITY', departmentId: rd.id, sortOrder: 1 } })
  const ttMod = await prisma.departmentModule.create({ data: { name: 'Tech Transfers', type: 'TECH_TRANSFERS', departmentId: rd.id, sortOrder: 2 } })
  const frmMod = await prisma.departmentModule.create({ data: { name: 'Formulations', type: 'FORMULATIONS', departmentId: rd.id, sortOrder: 3 } })
  const npdMod = await prisma.departmentModule.create({ data: { name: 'NPD Pipeline', type: 'NPD_PIPELINE', departmentId: rd.id, sortOrder: 4 } })
  const artworkMod = await prisma.departmentModule.create({ data: { name: 'Artwork', type: 'ARTWORK', departmentId: rd.id, sortOrder: 5 } })
  const skuMod = await prisma.departmentModule.create({ data: { name: 'SKU Pipeline', type: 'SKU_PIPELINE', departmentId: ops.id, sortOrder: 0 } })
  const invMod = await prisma.departmentModule.create({ data: { name: 'Inventory Health', type: 'INVENTORY_HEALTH', departmentId: ops.id, sortOrder: 1 } })
  const prodMod = await prisma.departmentModule.create({ data: { name: 'Production Tracking', type: 'PRODUCTION_TRACKING', departmentId: ops.id, sortOrder: 2 } })
  const brandMod = await prisma.departmentModule.create({ data: { name: 'Brand Transition', type: 'BRAND_TRANSITION', departmentId: ops.id, sortOrder: 3 } })
  const componentsMod = await prisma.departmentModule.create({ data: { name: 'Components', type: 'COMPONENTS', departmentId: ops.id, sortOrder: 4 } })
  const bomMod = await prisma.departmentModule.create({ data: { name: 'Bill of Materials', type: 'BILL_OF_MATERIALS', departmentId: ops.id, sortOrder: 5 } })
  console.log('✅ Modules: 12')

  // ─── Members
  const m = await Promise.all([
    prisma.member.create({ data: { clerkUserId: 'user_ahmad', email: 'ahmad@kareve.com', name: 'Ahmad G.', avatar: 'AG', role: 'OPS_MANAGER', departmentId: ops.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_ronald', email: 'ronald@kareve.com', name: 'Ronald M.', avatar: 'RM', role: 'DEPT_LEAD', departmentId: wh.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_tom', email: 'tom@kareve.com', name: 'Tom L.', avatar: 'TL', role: 'MEMBER', departmentId: wh.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_valencia', email: 'valencia@kareve.com', name: 'Valencia R.', avatar: 'VR', role: 'MEMBER', status: 'IN_MEETING', departmentId: ops.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_fei', email: 'fei@kareve.com', name: 'Fei W.', avatar: 'FW', role: 'MEMBER', departmentId: wh.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_jerome', email: 'jerome@kareve.com', name: 'Jerome S.', avatar: 'JS', role: 'MEMBER', departmentId: ops.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_sarah', email: 'sarah@kareve.com', name: 'Sarah K.', avatar: 'SK', role: 'DEPT_LEAD', status: 'FOCUSED', departmentId: ops.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_david', email: 'david@kareve.com', name: 'David P.', avatar: 'DP', role: 'DEPT_LEAD', departmentId: fin.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_lisa', email: 'lisa@kareve.com', name: 'Lisa C.', avatar: 'LC', role: 'MEMBER', status: 'OOO', departmentId: vm.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_mike', email: 'mike@kareve.com', name: 'Mike T.', avatar: 'MT', role: 'DEPT_LEAD', departmentId: rd.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_steven', email: 'steven@kareve.com', name: 'Steven R.', avatar: 'SR', role: 'MEMBER', departmentId: sales.id, orgId: org.id } }),
    prisma.member.create({ data: { clerkUserId: 'user_maya', email: 'maya@kareve.com', name: 'Maya L.', avatar: 'ML', role: 'MEMBER', departmentId: marketing.id, orgId: org.id } }),
  ])
  console.log('✅ Members: 12')

  // ─── R&D Briefs
  for (const b of [
    { name: 'Scalp & Edge Detox Shampoo 8oz', status: 'Formula Approved', brand: "Carol's Daughter", cm: 'ACT Labs', phase: 4, totalPhases: 5, owner: 'R&D Lead' },
    { name: 'Scalp & Edge Cleansing Oil 6oz', status: 'In Formulation', brand: "Carol's Daughter", cm: 'ACT Labs', phase: 3, totalPhases: 5, owner: 'R&D Lead' },
    { name: 'Scalp & Edge Renew Serum 2oz', status: 'Stability Testing', brand: "Carol's Daughter", cm: 'ACT Labs', phase: 3, totalPhases: 5, owner: 'Formulation Chemist' },
    { name: 'Scalp & Edge Balm 2oz', status: 'Formula Approved', brand: "Carol's Daughter", cm: 'ACT Labs', phase: 4, totalPhases: 5, owner: 'R&D Lead' },
    { name: 'Ambi Oil-Free Cleanser Reformulation', status: 'Brief Submitted', brand: 'Ambi', cm: 'Paklab', phase: 1, totalPhases: 5, owner: 'R&D Lead' },
    { name: 'AcneFree Sensitive Gel Update', status: 'In Formulation', brand: 'AcneFree', cm: 'Paklab', phase: 2, totalPhases: 5, owner: 'Formulation Chemist' },
  ]) await prisma.moduleItem.create({ data: { moduleId: briefsMod.id, data: b, status: b.status } })
  console.log('✅ R&D Briefs: 6')

  // ─── CM Productivity
  for (const c of [
    { name: 'Paklab', brands: ['Ambi', 'AcneFree'], onTime: 82, quality: 94, activePOs: 8, openIssues: 3, avgLeadTime: '6-8 wks', status: 'active' },
    { name: 'ACT Labs', brands: ["Carol's Daughter"], onTime: 91, quality: 97, activePOs: 4, openIssues: 1, avgLeadTime: '8-10 wks', status: 'active' },
    { name: 'TricorBraun', brands: ["Carol's Daughter", 'Ambi'], onTime: 75, quality: 88, activePOs: 2, openIssues: 2, avgLeadTime: '4-6 wks', status: 'attention' },
    { name: 'Jansy', brands: ["Carol's Daughter"], onTime: 95, quality: 96, activePOs: 1, openIssues: 0, avgLeadTime: '3-5 wks', status: 'active' },
  ]) await prisma.moduleItem.create({ data: { moduleId: cmMod.id, data: c, status: c.status } })
  console.log('✅ CM Data: 4')

  // ─── Tech Transfers
  for (const t of [
    { product: 'Goddess Strength Shampoo 11oz', from: "L'Oreal Legacy", to: 'ACT Labs', status: 'Complete', progress: 100, target: '2026-02-15', docs: 8 },
    { product: 'Black Vanilla Shampoo 12oz', from: "L'Oreal Legacy", to: 'ACT Labs', status: 'In Progress', progress: 65, target: '2026-04-30', docs: 4 },
    { product: 'Ambi Even & Clear Cleanser', from: 'Paklab NJ', to: 'Paklab TX', status: 'Planning', progress: 15, target: '2026-06-30', docs: 2 },
  ]) await prisma.moduleItem.create({ data: { moduleId: ttMod.id, data: t, status: t.status } })
  console.log('✅ Tech Transfers: 3')

  // ─── Formulations
  for (const f of [
    { product: 'Scalp & Edge Detox Shampoo', ver: 'v3.2', status: 'Approved', stability: 'Pass', cm: 'ACT Labs', changes: 'Reduced sulfate 15%, added tea tree oil' },
    { product: 'Scalp & Edge Cleansing Oil', ver: 'v2.1', status: 'In Review', stability: 'Testing', cm: 'ACT Labs', changes: 'Switched carrier oil to argan blend' },
    { product: 'Ambi Oil-Free Cleanser', ver: 'v1.0-R', status: 'Draft', stability: 'Pending', cm: 'Paklab', changes: 'Remove parabens, add niacinamide' },
  ]) await prisma.moduleItem.create({ data: { moduleId: frmMod.id, data: f, status: f.status } })
  console.log('✅ Formulations: 3')

  // ─── NPD Pipeline, Artwork, Components
  for (const n of [
    { name: 'Lisa Kitchen Serum', brand: 'Haircare', owner: 'Steven', cm: 'ACT', launch: 'Jun 19, 2026', status: 'Active', progress: 12, tasksComplete: 4, tasksTotal: 34, links: ['Brief', 'Formulation', 'CM: ACT'] },
    { name: 'Scalp & Edge Treatment Mist', brand: "Carol's Daughter", owner: 'R&D Lead', cm: 'ACT', launch: 'Jul 10, 2026', status: 'Planning', progress: 24, tasksComplete: 7, tasksTotal: 29, links: ['Brief', 'Artwork', 'Components'] },
  ]) await prisma.moduleItem.create({ data: { moduleId: npdMod.id, data: n, status: n.status } })
  for (const a of [
    { product: 'CD Scalp Detox Shampoo 8oz', owner: 'Sarah K.', status: 'Awaiting Artwork', due: 'Apr 02', files: 3 },
    { product: 'CD Scalp Cleansing Oil 6oz', owner: 'Marketing', status: 'In Review', due: 'Apr 05', files: 5 },
    { product: 'Ambi Oil-Free Cleanser Reformulation', owner: 'R&D', status: 'Draft', due: 'Apr 08', files: 2 },
  ]) await prisma.moduleItem.create({ data: { moduleId: artworkMod.id, data: a, status: a.status } })
  for (const c of [
    { component: 'TricorBraun bottle', product: 'CD Scalp Cleansing Oil 6oz', vendor: 'TricorBraun', status: 'MOQ Pending', risk: 'High' },
    { component: 'Jansy tube', product: 'Scalp & Edge Balm 2oz', vendor: 'Jansy', status: 'Quoted', risk: 'Low' },
    { component: 'Label stock', product: 'CD Scalp Detox Shampoo 8oz', vendor: 'ACT Labs', status: 'Approved', risk: 'Low' },
  ]) await prisma.moduleItem.create({ data: { moduleId: componentsMod.id, data: c, status: c.status } })
  console.log('✅ NPD modules: 8')

  // ─── BOM Part Master (seeded into the Components module so BOMs can reference real components)
  // partType enum: bulk | bottle | cap | tube | carton | label | shipper | divider | shrinkwrap | other
  const BOM_PARTS: { pn: string; desc: string; type: string; vendor: string }[] = [
    { pn: 'CD-73ACT139', desc: 'BULK-Formula#73ACT139_BalancingSerum2oz', type: 'bulk', vendor: 'ACT' },
    { pn: 'CD-73ACT166A', desc: 'BULK-Formula#73ACT166A_TreatmentBalm2oz', type: 'bulk', vendor: 'ACT' },
    { pn: 'CD-73ACT105', desc: 'BULK-Formula#73ACT105_DetoxNectar8oz', type: 'bulk', vendor: 'ACT' },
    { pn: 'CD-67ACT166', desc: 'BULK-Formula#67ACT166_CleansingOil6oz', type: 'bulk', vendor: 'ACT' },
    { pn: 'CD-101000', desc: 'Glass Bottle w Dropper Set; custom color-BestChinaSourcing', type: 'bottle', vendor: 'BestChinaSourcing' },
    { pn: 'CD-101001', desc: 'Product label-LK Balancing Serum', type: 'label', vendor: 'BROOK + WHITTLE' },
    { pn: 'CD-101002', desc: 'Shipper corrugate dividers', type: 'divider', vendor: 'Undirected' },
    { pn: 'CD-101003', desc: 'Shipper-12 ct (ship test with pad)', type: 'shipper', vendor: 'Undirected' },
    { pn: 'CD-101004', desc: 'Tube 2oz-JansyPkg', type: 'tube', vendor: 'Jansy Packaging' },
    { pn: 'CD-101005', desc: 'Unit carton-MillRockPkg', type: 'carton', vendor: 'Mill Rock Pkg' },
    { pn: 'CD-101006', desc: 'Shipper-24 ct', type: 'shipper', vendor: 'Undirected' },
    { pn: 'CD-101007', desc: '8oz PET Cylinder #365649 -Tricor', type: 'bottle', vendor: 'TricorBraun' },
    { pn: 'CD-101008', desc: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', type: 'cap', vendor: 'BestChinaSourcing' },
    { pn: 'CD-101009', desc: 'Product label-LK Detox Nectar', type: 'label', vendor: 'BROOK + WHITTLE' },
    { pn: 'CD-101010', desc: 'Shipper-12 ct', type: 'shipper', vendor: 'Undirected' },
    { pn: 'CD-101011', desc: '6oz PET Cylinder #365648 -Tricor', type: 'bottle', vendor: 'TricorBraun' },
    { pn: 'CD-101012', desc: 'Product label-LK Cleansing Oil', type: 'label', vendor: 'BROOK + WHITTLE' },
    { pn: 'CD-101013', desc: 'Shipper-12 ct', type: 'shipper', vendor: 'Undirected' },
    { pn: 'CD-101014', desc: 'Shrink-wrap', type: 'shrinkwrap', vendor: 'Undirected' },
  ]
  // Base unit cost per part type (for MOQ cost tiers — bulk formulas cost comes from formulation, so no tiers)
  const BASE_UNIT_COST: Record<string, number> = {
    bottle: 0.62, cap: 0.12, tube: 0.35, carton: 0.28, label: 0.08, shipper: 0.45, divider: 0.15, shrinkwrap: 0.03, other: 0.20,
  }
  const partIdByPn: Record<string, string> = {}
  for (const p of BOM_PARTS) {
    const base = BASE_UNIT_COST[p.type] ?? 0.2
    // Two MOQ tiers: higher volume → lower unit cost. Bulk parts get none (cost via formulation).
    const moqTiers = p.type === 'bulk' ? [] : [
      { moqQuantity: 5000, unitCost: Number((base * 1.15).toFixed(3)), toolingCost: p.type === 'bottle' ? 3500 : 0, sampleCost: 150, shippingCostPerUnit: Number((base * 0.12).toFixed(3)), dutyRatePct: p.vendor === 'BestChinaSourcing' ? 8 : 0, totalLandedCost: 0, effectiveDate: '2026-01-01', expiryDate: '2026-12-31', quoteReference: `Q-${p.pn}-5K` },
      { moqQuantity: 25000, unitCost: base, toolingCost: 0, sampleCost: 0, shippingCostPerUnit: Number((base * 0.10).toFixed(3)), dutyRatePct: p.vendor === 'BestChinaSourcing' ? 8 : 0, totalLandedCost: 0, effectiveDate: '2026-01-01', expiryDate: '2026-12-31', quoteReference: `Q-${p.pn}-25K` },
    ]
    const item = await prisma.moduleItem.create({
      data: {
        moduleId: componentsMod.id,
        status: 'Approved',
        data: {
          name: p.desc, partNumber: p.pn, description: p.desc, type: p.type, vendor: p.vendor, status: 'Approved',
          targetCostPerUnit: p.type === 'bulk' ? null : Number((base * 0.95).toFixed(3)),
          moqTiers,
          vendors: [{ vendorName: p.vendor, vendorStatus: 'Primary' }],
        },
      },
    })
    partIdByPn[p.pn] = item.id
  }
  console.log(`✅ BOM parts (components): ${BOM_PARTS.length}`)

  // ─── Bills of Materials (4 real Carol's Daughter / Lisa's Kitchen BOMs)
  type SeedLine = { pn: string; desc: string; um: string }
  type SeedBom = {
    fgPartNumber: string; productName: string; fillClaim: string; minFill: string
    fillerSupplier: string; fillerName: string; caseQty: number; innerPack: string
    overUnderTolerance: string; launchPriority: number; lines: SeedLine[]
  }
  const SEED_BOMS: SeedBom[] = [
    {
      fgPartNumber: 'K8120000', productName: "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Balancing Serum 2oz",
      fillClaim: '2.0 fl oz', minFill: 'Legal fill claim', fillerSupplier: 'ACT', fillerName: '"CD LK SCALP & EDGE BALANCING SERUM 2OZ"',
      caseQty: 12, innerPack: '3 eaches per', overUnderTolerance: '[+ or – 8%]', launchPriority: 3,
      lines: [
        { pn: 'CD-73ACT139', desc: 'BULK-Formula#73ACT139_BalancingSerum2oz', um: '1' },
        { pn: 'CD-101000', desc: 'Glass Bottle w Dropper Set; custom color-BestChinaSourcing', um: '1' },
        { pn: 'CD-101001', desc: 'Product label-LK Balancing Serum', um: '1' },
        { pn: 'CD-101002', desc: 'Shipper corrugate dividers', um: '1' },
        { pn: 'CD-101003', desc: 'Shipper-12 ct (ship test with pad)', um: '1' },
        { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
      ],
    },
    {
      fgPartNumber: 'K8130000', productName: "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Treatment Balm 2oz",
      fillClaim: '2.0 fl oz', minFill: 'Legal fill claim', fillerSupplier: 'ACT', fillerName: '"CD LK SCALP & EDGE TREATMENT BALM 2OZ"',
      caseQty: 24, innerPack: '3 eaches per', overUnderTolerance: 'Industry Standard [+ or – 10%]', launchPriority: 4,
      lines: [
        { pn: 'CD-73ACT166A', desc: 'BULK-Formula#73ACT166A_TreatmentBalm2oz', um: '1' },
        { pn: 'CD-101004', desc: 'Tube 2oz-JansyPkg', um: '1' },
        { pn: 'CD-101005', desc: 'Unit carton-MillRockPkg', um: '1' },
        { pn: 'CD-101006', desc: 'Shipper-24 ct', um: '1' },
        { pn: 'CD-101014', desc: 'Shrink-wrap (8 inner packs of 3 eaches)', um: '-' },
      ],
    },
    {
      fgPartNumber: 'K8140000', productName: "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Detox Nectar 8oz",
      fillClaim: '8.0 fl oz', minFill: 'Legal fill claim', fillerSupplier: 'ACT', fillerName: '"CD LK SCALP & EDGE DETOX NECTAR 8OZ"',
      caseQty: 12, innerPack: '3 eaches per', overUnderTolerance: '[+ or – 8%]', launchPriority: 2,
      lines: [
        { pn: 'CD-73ACT105', desc: 'BULK-Formula#73ACT105_DetoxNectar8oz', um: '1' },
        { pn: 'CD-101007', desc: '8oz PET Cylinder #365649 -Tricor', um: '1' },
        { pn: 'CD-101008', desc: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', um: '1' },
        { pn: 'CD-101009', desc: 'Product label-LK Detox Nectar', um: '1' },
        { pn: 'CD-101010', desc: 'Shipper-12 ct', um: '1' },
        { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
      ],
    },
    {
      fgPartNumber: 'K8150000', productName: "Carol's Daughter Lisa's Kitchen Scalp & Edge Care Cleansing Oil 6oz",
      fillClaim: '6.0 fl oz', minFill: 'Legal fill claim', fillerSupplier: 'ACT', fillerName: '"CD LK SCALP & EDGE CLEANSING OIL 6OZ"',
      caseQty: 12, innerPack: '3 eaches per', overUnderTolerance: '[+ or – 8%]', launchPriority: 1,
      lines: [
        { pn: 'CD-67ACT166', desc: 'BULK-Formula#67ACT166_CleansingOil6oz', um: '1' },
        { pn: 'CD-101011', desc: '6oz PET Cylinder #365648 -Tricor', um: '1' },
        { pn: 'CD-101008', desc: '24/410 needle nose cap, custom color 2655C-BestChinaSourcing', um: '1' },
        { pn: 'CD-101012', desc: 'Product label-LK Cleansing Oil', um: '1' },
        { pn: 'CD-101013', desc: 'Shipper-12 ct', um: '1' },
        { pn: 'CD-101014', desc: 'Shrink-wrap (4 inner packs of 3 eaches)', um: '-' },
      ],
    },
  ]
  for (const b of SEED_BOMS) {
    const partLookup = BOM_PARTS.reduce((acc, p) => { acc[p.pn] = p; return acc }, {} as Record<string, typeof BOM_PARTS[number]>)
    const lines = b.lines.map((ln, i) => ({
      lineNo: i + 1,
      componentId: partIdByPn[ln.pn] ?? null,
      partNumber: ln.pn,
      description: ln.desc,
      um: ln.um,
      supplier: partLookup[ln.pn]?.vendor ?? '',
      partType: partLookup[ln.pn]?.type ?? 'other',
    }))
    await prisma.moduleItem.create({
      data: {
        moduleId: bomMod.id,
        status: 'active',
        data: {
          brand: "Carol's Daughter",
          fgPartNumber: b.fgPartNumber,
          productName: b.productName,
          fillClaim: b.fillClaim,
          minFill: b.minFill,
          fillerSupplier: b.fillerSupplier,
          fillerName: b.fillerName,
          caseQty: b.caseQty,
          innerPack: b.innerPack,
          overUnderTolerance: b.overUnderTolerance,
          launchPriority: b.launchPriority,
          status: 'active',
          version: 1,
          lines,
        },
      },
    })
  }
  console.log(`✅ Bills of Materials: ${SEED_BOMS.length}`)

  // ─── Finance: FINANCE_COSTING module (finance-owned cost overrides/additions per SKU)
  // These layer on top of the live roll-ups (BOM component landed costs + formulation cost)
  // to produce a finished-good COGS + margin. Keyed by fgPartNumber (SKU).
  const finCostingMod = await prisma.departmentModule.create({ data: { name: 'Costing', type: 'FINANCE_COSTING', departmentId: fin.id, sortOrder: 0 } })
  for (const fc of [
    { fgPartNumber: 'K8120000', productName: "CD LK Balancing Serum 2oz", brand: "Carol's Daughter", labelCost: 0.18, freightPerUnit: 0.22, overheadPerUnit: 0.35, targetMarginPct: 65, cogsOverride: null, retailPrice: 24.0, notes: 'Glass dropper drives unit cost' },
    { fgPartNumber: 'K8130000', productName: "CD LK Treatment Balm 2oz", brand: "Carol's Daughter", labelCost: 0.0, freightPerUnit: 0.18, overheadPerUnit: 0.30, targetMarginPct: 68, cogsOverride: null, retailPrice: 22.0, notes: 'Carton + tube' },
    { fgPartNumber: 'K8140000', productName: "CD LK Detox Nectar 8oz", brand: "Carol's Daughter", labelCost: 0.21, freightPerUnit: 0.28, overheadPerUnit: 0.40, targetMarginPct: 62, cogsOverride: null, retailPrice: 28.0, notes: '' },
    { fgPartNumber: 'K8150000', productName: "CD LK Cleansing Oil 6oz", brand: "Carol's Daughter", labelCost: 0.19, freightPerUnit: 0.25, overheadPerUnit: 0.38, targetMarginPct: 64, cogsOverride: null, retailPrice: 26.0, notes: '' },
  ]) await prisma.moduleItem.create({ data: { moduleId: finCostingMod.id, status: 'active', data: fc } })
  console.log('✅ Finance costing rows: 4')

  // ─── SKU Pipeline
  for (const s of [
    { name: 'CD Scalp Detox Shampoo 8oz', sku: 'K6001100', upc: '0885221006011', status: 'Awaiting Artwork', brand: "Carol's Daughter", step: 3, totalSteps: 6, owner: 'Operations', blocker: null },
    { name: 'CD Scalp Cleansing Oil 6oz', sku: 'K6001200', upc: '0885221006028', status: 'Component Sourcing', brand: "Carol's Daughter", step: 2, totalSteps: 6, owner: 'Vendor Mgmt', blocker: 'TricorBraun MOQ pending' },
    { name: 'CD Scalp Renew Serum 2oz', sku: 'K6001300', upc: '0885221006035', status: 'Formula Pending', brand: "Carol's Daughter", step: 1, totalSteps: 6, owner: 'R&D', blocker: 'Stability testing' },
    { name: 'Ambi Fade Cream Normal Skin 2oz', sku: 'K7102200', upc: '0309978061204', status: 'Pre-Production', brand: 'Ambi', step: 4, totalSteps: 6, owner: 'Operations', blocker: null },
    { name: 'AcneFree Oil-Free Acne Cleanser 8oz', sku: 'K8203100', upc: '0688815001207', status: 'In Production', brand: 'AcneFree', step: 5, totalSteps: 6, owner: 'Operations', blocker: null },
  ]) await prisma.moduleItem.create({ data: { moduleId: skuMod.id, data: s, status: s.status } })
  console.log('✅ SKU Pipeline: 5')

  // ─── Inventory
  for (const i of [
    { sku: 'K4415110', name: 'Goddess Strength Shampoo 11oz', onHand: 2, committed: 8778, available: 0, coverageMonths: 0, status: 'emergency' },
    { sku: 'K3386201', name: 'BLK Vanilla Shmp 8.5oz', onHand: 1, committed: 245, available: 0, coverageMonths: 0, status: 'emergency' },
    { sku: 'K5517804', name: 'Born to Repair Cond 11oz', onHand: 19, committed: 353, available: 0, coverageMonths: 0.3, status: 'critical' },
    { sku: 'K3692911', name: 'GS Conditioner 11oz', onHand: 4154, committed: 1200, available: 2954, coverageMonths: 8.2, status: 'healthy' },
    { sku: 'K3905507', name: 'BV Replenish Shampoo 12oz', onHand: 3821, committed: 180, available: 3641, coverageMonths: 21.5, status: 'healthy' },
    { sku: 'K5036900', name: 'GS Cocoon Mask 12oz', onHand: 1167, committed: 88, available: 1079, coverageMonths: 52.0, status: 'overstock' },
  ]) await prisma.moduleItem.create({ data: { moduleId: invMod.id, data: i, status: i.status } })
  console.log('✅ Inventory: 6')

  // ─── Production Orders
  for (const p of [
    { poNumber: 'PO-2026-041', product: 'GS Shampoo 11oz', cm: 'ACT Labs', qty: 50000, value: 0, status: 'Awaiting Materials', eta: '2026-05-15', brand: "Carol's Daughter", progress: 15, priority: 'emergency', coworkPending: true },
    { poNumber: 'PO-2026-038', product: 'Scalp Detox Shampoo 8oz', cm: 'ACT Labs', qty: 30000, value: 0, status: 'Production Scheduled', eta: '2026-05-01', brand: "Carol's Daughter", progress: 25 },
    { poNumber: 'PO-2026-035', product: 'Ambi Even Tone Cream 2oz', cm: 'Paklab', qty: 20000, value: 0, status: 'In Production', eta: '2026-04-10', brand: 'Ambi', progress: 60 },
    { poNumber: 'PO-2026-033', product: 'AF Sensitive Cleanser 6oz', cm: 'Paklab', qty: 15000, value: 0, status: 'QC Review', eta: '2026-03-30', brand: 'AcneFree', progress: 85 },
  ]) await prisma.moduleItem.create({ data: { moduleId: prodMod.id, data: p, status: p.status } })
  console.log('✅ Production: 4')

  for (const b of [
    { product: 'CD Scalp Detox Shampoo 8oz', from: "L'Oreal Legacy", to: 'Kareve SKU Master', owner: 'Operations', progress: 50, status: 'Awaiting Artwork', blocker: null },
    { product: 'CD Scalp Cleansing Oil 6oz', from: 'Formula Lock', to: 'Component Sourcing', owner: 'Vendor Mgmt', progress: 33, status: 'Component Sourcing', blocker: 'TricorBraun MOQ pending' },
    { product: 'CD Scalp Renew Serum 2oz', from: 'R&D Brief', to: 'Formula Approval', owner: 'R&D', progress: 16, status: 'Formula Pending', blocker: 'Stability testing' },
  ]) await prisma.moduleItem.create({ data: { moduleId: brandMod.id, data: b, status: b.status } })
  console.log('✅ Brand Transition: 3')

  // ─── Projects
  const projects = await Promise.all([
    prisma.project.create({ data: { title: 'CD Scalp & Edge Launch', status: 'ACTIVE', priority: 'P0', health: 72, orgId: org.id, leadId: m[0].id } }),
    prisma.project.create({ data: { title: 'Goddess Strength Restock', status: 'ACTIVE', priority: 'P0', health: 45, orgId: org.id, leadId: m[0].id } }),
    prisma.project.create({ data: { title: 'Ambi Q2 Production', status: 'ACTIVE', priority: 'P1', health: 88, orgId: org.id, leadId: m[9].id } }),
    prisma.project.create({ data: { title: '3PL Automation Pipeline', status: 'ACTIVE', priority: 'P1', health: 65, orgId: org.id, leadId: m[0].id } }),
  ])
  console.log('✅ Projects: 4')

  // ─── Cowork Spaces
  const cw1 = await prisma.coworkSpace.create({ data: { name: 'Scalp & Edge Production Launch', description: 'Cross-dept coordination for CD Scalp & Edge 4-SKU launch.', type: 'PROJECT', projectId: projects[0].id, deptNames: ['R&D', 'Operations', 'Vendor Mgmt'], memberIds: [m[0].id, m[9].id, m[8].id, m[6].id] } })
  const cw2 = await prisma.coworkSpace.create({ data: { name: 'GS Shampoo Emergency Restock', description: 'Emergency restock K4415110. 2 cases on hand, 208 orders at risk.', type: 'EMERGENCY', projectId: projects[1].id, deptNames: ['Operations', 'Warehouse'], memberIds: [m[0].id, m[1].id, m[2].id] } })
  console.log('✅ Cowork Spaces: 2')

  // ─── Activity Feed
  await prisma.activity.createMany({ data: [
    { type: 'UPDATE', content: 'SKU creation for Detox Shampoo and Edge Balm complete in Kareve Sync.', coworkSpaceId: cw1.id, authorId: m[0].id },
    { type: 'SUBMISSION', content: 'Formula v3.2 for Detox Shampoo approved. 24-month shelf life confirmed.', coworkSpaceId: cw1.id, authorId: m[9].id },
    { type: 'NOTE', content: '@Mike T. — Confirm Cleansing Oil formula timeline? Need specs for Jansy tubes by EOW.', coworkSpaceId: cw1.id, authorId: m[0].id, metadata: { email: { from: 'ahmad@kareve.com', subject: 'RE: Cleansing Oil Timeline', date: 'Mar 25' } } },
    { type: 'UPDATE', content: 'Escalated PO-2026-041 to ACT Labs. Requested 10K partial shipment by April 15.', coworkSpaceId: cw2.id, authorId: m[0].id },
    { type: 'UPDATE', content: 'Receiving dock capacity confirmed. Can process 500 cases/day.', coworkSpaceId: cw2.id, authorId: m[1].id },
  ] })
  console.log('✅ Activity Feed: 5')

  // ─── Cowork Tasks
  await prisma.task.createMany({ data: [
    { title: 'Finalize ACT Labs PO 50K run', status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: new Date('2026-03-28'), ownerId: m[0].id, departmentId: ops.id, projectId: projects[0].id, brandNames: ['cd'] },
    { title: 'Upload approved formula specs', status: 'COMPLETE', priority: 'HIGH', dueDate: new Date('2026-03-24'), completedAt: new Date('2026-03-24'), ownerId: m[9].id, departmentId: rd.id, projectId: projects[0].id, brandNames: ['cd'] },
    { title: 'Confirm TricorBraun bottle PO', status: 'BLOCKED', priority: 'CRITICAL', dueDate: new Date('2026-03-27'), ownerId: m[8].id, departmentId: vm.id, projectId: projects[0].id, brandNames: ['cd'] },
    { title: 'Create packaging artwork for 4 SKUs', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: new Date('2026-04-02'), ownerId: m[6].id, departmentId: ops.id, projectId: projects[0].id, brandNames: ['cd'] },
    { title: 'Expedite ACT Labs PO-2026-041', status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: new Date('2026-03-26'), ownerId: m[0].id, departmentId: ops.id, projectId: projects[1].id, brandNames: ['cd'] },
    { title: 'Reallocate inventory to priority orders', status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: new Date('2026-03-27'), ownerId: m[2].id, departmentId: wh.id, projectId: projects[1].id, brandNames: ['cd'] },
    { title: 'Amazon fill rate recovery plan', status: 'NOT_STARTED', priority: 'CRITICAL', dueDate: new Date('2026-03-27'), ownerId: m[0].id, departmentId: ops.id, brandNames: ['cd'] },
    { title: 'Emerson daily report automation', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: new Date('2026-04-01'), ownerId: m[0].id, departmentId: ops.id, projectId: projects[3].id, brandNames: ['cd', 'ambi', 'af'] },
    { title: 'Paklab 2026 pricing analysis', status: 'IN_REVIEW', priority: 'MEDIUM', dueDate: new Date('2026-03-30'), ownerId: m[7].id, departmentId: fin.id, projectId: projects[2].id, brandNames: ['ambi'] },
  ] })
  console.log('✅ Tasks: 9')

  // ─── Integrations
  await prisma.integration.createMany({ data: [
    { type: 'ERP_KAREVE_SYNC', name: 'Kareve Sync (ERP)', status: 'CONNECTED', syncCount: 24847, orgId: org.id },
    { type: 'MICROSOFT_OUTLOOK', name: 'Microsoft Outlook', status: 'CONNECTED', syncCount: 1247, orgId: org.id },
    { type: 'MICROSOFT_TEAMS', name: 'Microsoft Teams', status: 'CONNECTED', syncCount: 892, orgId: org.id },
    { type: 'MICROSOFT_ONEDRIVE', name: 'Microsoft OneDrive', status: 'CONNECTED', syncCount: 3456, orgId: org.id },
    { type: 'AMAZON_VENDOR_CENTRAL', name: 'Amazon Vendor Central', status: 'DISCONNECTED', orgId: org.id },
    { type: 'SLACK', name: 'Slack', status: 'DISCONNECTED', orgId: org.id },
    { type: 'GOOGLE_GMAIL', name: 'Google Gmail', status: 'DISCONNECTED', orgId: org.id },
    { type: 'GOOGLE_SHEETS', name: 'Google Sheets', status: 'DISCONNECTED', orgId: org.id },
    { type: 'ZAPIER', name: 'Zapier', status: 'DISCONNECTED', orgId: org.id },
  ] })
  console.log('✅ Integrations: 9')

  // ─── Pulse
  await prisma.pulse.createMany({ data: [
    { type: 'ALERT', message: 'K4415110 GS Shampoo — 2 cases remaining. 208 orders at risk.', deptName: 'Warehouse', targetId: m[0].id },
    { type: 'SIGNAL', message: 'TricorBraun MOQ BLOCKED — Lisa C. OOO until April 1.', deptName: 'Vendor Mgmt', targetId: m[0].id },
    { type: 'ALERT', message: 'Scalp & Edge PO decision overdue — 48hr escalation.', deptName: 'Production', targetId: m[0].id },
    { type: 'SIGNAL', message: 'Mike T. uploaded Detox COA v3.2 to Scalp & Edge Cowork.', deptName: 'R&D', targetId: m[0].id },
    { type: 'HEARTBEAT', message: 'AF Sensitive Kit cost review Complete.', deptName: 'Finance' },
    { type: 'BROADCAST', message: 'WOSR due Friday 4 PM. Dept leads update by Thursday.', deptName: 'Executive' },
  ] })
  console.log('✅ Pulse: 6')

  // ─── Escalation Rules
  await prisma.escalationRule.createMany({ data: [
    { trigger: 'task_overdue_24h', action: 'notify_owner', delayMinutes: 0 },
    { trigger: 'task_overdue_24h', action: 'notify_dept_lead', delayMinutes: 1440 },
    { trigger: 'task_overdue_48h', action: 'notify_project_lead', delayMinutes: 2880 },
    { trigger: 'task_overdue_72h', action: 'broadcast_stakeholders', delayMinutes: 4320 },
    { trigger: 'inventory_emergency', action: 'alert_ops_manager', delayMinutes: 0 },
  ] })
  console.log('✅ Escalation Rules: 5')

  console.log('\n🎉 Seed complete! Run `pnpm dev:api` to start.\n')
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
