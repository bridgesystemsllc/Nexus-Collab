import { PrismaClient } from '@prisma/client'

// ─── Projects & Initiatives seed ─────────────────────────────
// Idempotent: safe to run on every deploy. Upserts by stable `code`, never
// deletes, and never overwrites an admin's edits to label/department beyond
// what a fresh install needs.
//
// Department reality check (2026-08): this org has Operations, R&D, Finance,
// Marketing and Warehouse. There is no separate Regulatory, IT, or Supply
// Chain department — supply chain work sits inside Operations. Project types
// that the original spec pointed at those departments are remapped below and
// each remap is commented, because a silently wrong default owner sends new
// projects to the wrong team.

const prisma = new PrismaClient()

// ─── Department codes ────────────────────────────────────────
// `type` cannot identify a specific department (every custom one is 'CUSTOM'),
// so a stable code is what seeds, templates and project types reference.
const DEPARTMENT_CODES: { match: { name: string }; code: string }[] = [
  { match: { name: 'Operations' }, code: 'OPERATIONS' },
  { match: { name: 'R&D' }, code: 'R_AND_D' },
  { match: { name: 'Finance' }, code: 'FINANCE' },
  { match: { name: 'Marketing' }, code: 'MARKETING' },
  { match: { name: 'Warehouse' }, code: 'WAREHOUSE' },
  // Archived today, but coded so they keep a stable identity if reactivated.
  { match: { name: 'Sales' }, code: 'SALES' },
  { match: { name: 'Vendor Mgmt' }, code: 'VENDOR_MGMT' },
]

// Departments that must be active for the module to work as specified.
const MUST_BE_ACTIVE = ['MARKETING']

export interface ProjectTypeSeed {
  code: string
  label: string
  departmentCode: string | null
  icon: string
  description: string
  requiredFields: string[]
  sortOrder: number
}

export const PROJECT_TYPES: ProjectTypeSeed[] = [
  {
    code: 'NPD', label: 'New Product Development', departmentCode: 'R_AND_D',
    icon: 'sparkles', description: 'End-to-end new product introduction through the NPD stage gates.',
    requiredFields: [], sortOrder: 10,
  },
  {
    code: 'PACKAGING', label: 'New / Revised Packaging', departmentCode: 'R_AND_D',
    icon: 'package', description: 'Primary or secondary packaging change. Links Artwork and Components.',
    requiredFields: [], sortOrder: 20,
  },
  {
    code: 'FORMULA', label: 'New Form or Formula Creation', departmentCode: 'R_AND_D',
    icon: 'flask-conical', description: 'Bench work through scale-up. Links Formulations.',
    requiredFields: [], sortOrder: 30,
  },
  {
    // Spec default was REGULATORY. No such department exists; labeling and
    // claims work is owned by R&D here, which also owns Artwork.
    code: 'BILINGUAL_LABEL', label: 'Bilingual / Regional Labeling', departmentCode: 'R_AND_D',
    icon: 'languages', description: 'Health Canada, NPN, FR/EN and other regional label requirements.',
    requiredFields: ['markets'], sortOrder: 40,
  },
  {
    // Spec default was SUPPLY_CHAIN. Supply chain sits inside Operations here.
    code: 'SUPPLIER_SOURCING', label: 'New Supplier Identification', departmentCode: 'OPERATIONS',
    icon: 'search', description: 'RFQ through qualification and onboarding of a new supplier.',
    requiredFields: [], sortOrder: 50,
  },
  {
    // Spec default was SUPPLY_CHAIN. Same remap as above.
    code: 'SUPPLY_CHAIN', label: 'Supply Chain Initiative', departmentCode: 'OPERATIONS',
    icon: 'truck', description: 'Freight, warehousing and distribution network changes.',
    requiredFields: [], sortOrder: 60,
  },
  {
    code: 'COST_SAVINGS', label: 'Cost Savings / Value Engineering', departmentCode: 'FINANCE',
    icon: 'trending-down', description: 'Margin recovery and value engineering with a quantified target.',
    requiredFields: ['savingsTarget'], sortOrder: 70,
  },
  {
    code: 'RETAILER_PROGRAM', label: 'Retailer Program / Launch', departmentCode: 'OPERATIONS',
    icon: 'store', description: 'Target, Walmart, Ulta, CVS, Macy’s, Loblaws programs and launches.',
    requiredFields: ['retailers'], sortOrder: 80,
  },
  {
    // Spec default was REGULATORY. Remapped to R&D as with BILINGUAL_LABEL.
    code: 'REGULATORY', label: 'Regulatory / Compliance Project', departmentCode: 'R_AND_D',
    icon: 'shield-check', description: 'FDA, Health Canada and EU CPNP compliance work.',
    requiredFields: ['markets'], sortOrder: 90,
  },
  {
    // Spec default was IT. No IT department exists; systems work is run out of
    // Operations today.
    code: 'SYSTEM_TECH', label: 'Systems / Technology', departmentCode: 'OPERATIONS',
    icon: 'cpu', description: 'Dashboard, Nexus, EDI and Desk Agent build work.',
    requiredFields: [], sortOrder: 100,
  },
  {
    code: 'MARKETING_CAMPAIGN', label: 'Marketing Campaign / Launch Support', departmentCode: 'MARKETING',
    icon: 'megaphone', description: 'Asset calendar and channel plan supporting a launch.',
    requiredFields: [], sortOrder: 110,
  },
  {
    code: 'PROCESS_IMPROVEMENT', label: 'Process Improvement', departmentCode: 'OPERATIONS',
    icon: 'workflow', description: 'SOP changes and operational automation.',
    requiredFields: [], sortOrder: 120,
  },
  {
    code: 'DISCONTINUATION', label: 'SKU Discontinuation / Transition', departmentCode: 'OPERATIONS',
    icon: 'archive', description: 'Sell-through, obsolescence and transition planning.',
    requiredFields: [], sortOrder: 130,
  },
  {
    code: 'OTHER', label: 'Other Initiative', departmentCode: null,
    icon: 'circle-dot', description: 'Anything that does not fit an established type.',
    requiredFields: [], sortOrder: 999,
  },
]

// ─── Templates ───────────────────────────────────────────────
// Offsets are days from project start so a template applies to any start date.
// `dependsOn` indexes into the same template's task array.
interface TemplateSeed {
  name: string
  typeCode: string
  description: string
  definition: {
    phases: { name: string; sequence: number; offsetDays: number; durationDays: number; departmentCode: string }[]
    milestones: { name: string; phaseSequence: number; offsetDays: number; isGate: boolean; departmentCode: string }[]
    tasks: {
      title: string; phaseSequence: number; departmentCode: string
      offsetDays: number; durationDays: number; estimatedHours?: number; dependsOn?: number[]
    }[]
  }
}

export const TEMPLATES: TemplateSeed[] = [
  {
    name: 'New Product Development — standard gate plan',
    typeCode: 'NPD',
    description: 'Concept through launch across R&D, Operations and Marketing.',
    definition: {
      phases: [
        { name: 'Concept & Feasibility', sequence: 1, offsetDays: 0, durationDays: 30, departmentCode: 'R_AND_D' },
        { name: 'Formulation & Bench', sequence: 2, offsetDays: 30, durationDays: 60, departmentCode: 'R_AND_D' },
        { name: 'Packaging & Artwork', sequence: 3, offsetDays: 60, durationDays: 45, departmentCode: 'R_AND_D' },
        { name: 'Scale-up & Validation', sequence: 4, offsetDays: 105, durationDays: 45, departmentCode: 'OPERATIONS' },
        { name: 'Launch Readiness', sequence: 5, offsetDays: 150, durationDays: 30, departmentCode: 'OPERATIONS' },
      ],
      milestones: [
        { name: 'Concept approved', phaseSequence: 1, offsetDays: 30, isGate: true, departmentCode: 'R_AND_D' },
        { name: 'Formula locked', phaseSequence: 2, offsetDays: 90, isGate: true, departmentCode: 'R_AND_D' },
        { name: 'Artwork released to print', phaseSequence: 3, offsetDays: 105, isGate: true, departmentCode: 'R_AND_D' },
        { name: 'First production run complete', phaseSequence: 4, offsetDays: 150, isGate: true, departmentCode: 'OPERATIONS' },
        { name: 'Retail on-shelf', phaseSequence: 5, offsetDays: 180, isGate: false, departmentCode: 'MARKETING' },
      ],
      tasks: [
        { title: 'Define product concept and target consumer', phaseSequence: 1, departmentCode: 'R_AND_D', offsetDays: 0, durationDays: 10, estimatedHours: 16 },
        { title: 'Competitive and claims landscape review', phaseSequence: 1, departmentCode: 'MARKETING', offsetDays: 5, durationDays: 10, estimatedHours: 12 },
        { title: 'Preliminary cost model', phaseSequence: 1, departmentCode: 'FINANCE', offsetDays: 10, durationDays: 10, estimatedHours: 8, dependsOn: [0] },
        { title: 'Bench formulation development', phaseSequence: 2, departmentCode: 'R_AND_D', offsetDays: 30, durationDays: 40, estimatedHours: 80, dependsOn: [0] },
        { title: 'Stability testing kickoff', phaseSequence: 2, departmentCode: 'R_AND_D', offsetDays: 70, durationDays: 20, estimatedHours: 16, dependsOn: [3] },
        { title: 'Primary packaging selection', phaseSequence: 3, departmentCode: 'R_AND_D', offsetDays: 60, durationDays: 20, estimatedHours: 24 },
        { title: 'Artwork brief and design rounds', phaseSequence: 3, departmentCode: 'MARKETING', offsetDays: 75, durationDays: 25, estimatedHours: 40, dependsOn: [5] },
        { title: 'Regulatory label review', phaseSequence: 3, departmentCode: 'R_AND_D', offsetDays: 95, durationDays: 10, estimatedHours: 12, dependsOn: [6] },
        { title: 'Contract manufacturer scale-up trial', phaseSequence: 4, departmentCode: 'OPERATIONS', offsetDays: 105, durationDays: 30, estimatedHours: 60, dependsOn: [4] },
        { title: 'Component POs placed', phaseSequence: 4, departmentCode: 'OPERATIONS', offsetDays: 110, durationDays: 15, estimatedHours: 12, dependsOn: [7] },
        { title: 'Set up SKU in ERP and dashboard', phaseSequence: 5, departmentCode: 'OPERATIONS', offsetDays: 150, durationDays: 10, estimatedHours: 8, dependsOn: [8] },
        { title: 'Retailer setup and item forms', phaseSequence: 5, departmentCode: 'OPERATIONS', offsetDays: 155, durationDays: 15, estimatedHours: 20, dependsOn: [10] },
        { title: 'Launch asset delivery', phaseSequence: 5, departmentCode: 'MARKETING', offsetDays: 160, durationDays: 20, estimatedHours: 32, dependsOn: [6] },
      ],
    },
  },
  {
    name: 'Packaging change — artwork through first run',
    typeCode: 'PACKAGING',
    description: 'Revised packaging or artwork with component and production impact.',
    definition: {
      phases: [
        { name: 'Definition', sequence: 1, offsetDays: 0, durationDays: 14, departmentCode: 'R_AND_D' },
        { name: 'Artwork', sequence: 2, offsetDays: 14, durationDays: 35, departmentCode: 'R_AND_D' },
        { name: 'Component Transition', sequence: 3, offsetDays: 49, durationDays: 45, departmentCode: 'OPERATIONS' },
      ],
      milestones: [
        { name: 'Change scope approved', phaseSequence: 1, offsetDays: 14, isGate: true, departmentCode: 'R_AND_D' },
        { name: 'Artwork released to print', phaseSequence: 2, offsetDays: 49, isGate: true, departmentCode: 'R_AND_D' },
        { name: 'Old component sell-through complete', phaseSequence: 3, offsetDays: 94, isGate: false, departmentCode: 'OPERATIONS' },
      ],
      tasks: [
        { title: 'Document the packaging change and rationale', phaseSequence: 1, departmentCode: 'R_AND_D', offsetDays: 0, durationDays: 7, estimatedHours: 8 },
        { title: 'Assess affected SKUs and on-hand components', phaseSequence: 1, departmentCode: 'OPERATIONS', offsetDays: 3, durationDays: 10, estimatedHours: 12 },
        { title: 'Cost impact analysis', phaseSequence: 1, departmentCode: 'FINANCE', offsetDays: 7, durationDays: 7, estimatedHours: 6, dependsOn: [0] },
        { title: 'Artwork design rounds', phaseSequence: 2, departmentCode: 'MARKETING', offsetDays: 14, durationDays: 21, estimatedHours: 40, dependsOn: [0] },
        { title: 'Regulatory and claims review', phaseSequence: 2, departmentCode: 'R_AND_D', offsetDays: 35, durationDays: 10, estimatedHours: 12, dependsOn: [3] },
        { title: 'Printer proof approval', phaseSequence: 2, departmentCode: 'OPERATIONS', offsetDays: 45, durationDays: 4, estimatedHours: 4, dependsOn: [4] },
        { title: 'Place new component PO', phaseSequence: 3, departmentCode: 'OPERATIONS', offsetDays: 49, durationDays: 10, estimatedHours: 6, dependsOn: [5] },
        { title: 'Plan old component sell-through', phaseSequence: 3, departmentCode: 'OPERATIONS', offsetDays: 49, durationDays: 45, estimatedHours: 16, dependsOn: [1] },
      ],
    },
  },
  {
    name: 'Supplier qualification — RFQ to approved',
    typeCode: 'SUPPLIER_SOURCING',
    description: 'Identify, qualify and onboard a new supplier.',
    definition: {
      phases: [
        { name: 'Identification & RFQ', sequence: 1, offsetDays: 0, durationDays: 21, departmentCode: 'OPERATIONS' },
        { name: 'Qualification', sequence: 2, offsetDays: 21, durationDays: 45, departmentCode: 'OPERATIONS' },
        { name: 'Onboarding', sequence: 3, offsetDays: 66, durationDays: 30, departmentCode: 'OPERATIONS' },
      ],
      milestones: [
        { name: 'RFQ responses received', phaseSequence: 1, offsetDays: 21, isGate: false, departmentCode: 'OPERATIONS' },
        { name: 'Supplier approved', phaseSequence: 2, offsetDays: 66, isGate: true, departmentCode: 'OPERATIONS' },
        { name: 'First PO placed', phaseSequence: 3, offsetDays: 96, isGate: false, departmentCode: 'OPERATIONS' },
      ],
      tasks: [
        { title: 'Define sourcing requirements and specs', phaseSequence: 1, departmentCode: 'OPERATIONS', offsetDays: 0, durationDays: 7, estimatedHours: 12 },
        { title: 'Build candidate supplier list', phaseSequence: 1, departmentCode: 'OPERATIONS', offsetDays: 5, durationDays: 10, estimatedHours: 16, dependsOn: [0] },
        { title: 'Issue RFQ and collect quotes', phaseSequence: 1, departmentCode: 'OPERATIONS', offsetDays: 12, durationDays: 14, estimatedHours: 12, dependsOn: [1] },
        { title: 'Cost and landed-price comparison', phaseSequence: 2, departmentCode: 'FINANCE', offsetDays: 21, durationDays: 10, estimatedHours: 10, dependsOn: [2] },
        { title: 'Request and review samples', phaseSequence: 2, departmentCode: 'R_AND_D', offsetDays: 24, durationDays: 21, estimatedHours: 24, dependsOn: [2] },
        { title: 'Quality audit and documentation review', phaseSequence: 2, departmentCode: 'OPERATIONS', offsetDays: 40, durationDays: 20, estimatedHours: 20, dependsOn: [4] },
        { title: 'Contract and payment terms', phaseSequence: 3, departmentCode: 'FINANCE', offsetDays: 66, durationDays: 20, estimatedHours: 12, dependsOn: [5] },
        { title: 'Set up supplier in ERP', phaseSequence: 3, departmentCode: 'OPERATIONS', offsetDays: 80, durationDays: 10, estimatedHours: 6, dependsOn: [6] },
      ],
    },
  },
  {
    name: 'Retailer program — setup to on-shelf',
    typeCode: 'RETAILER_PROGRAM',
    description: 'Retailer launch or program with item setup, compliance and logistics.',
    definition: {
      phases: [
        { name: 'Program Definition', sequence: 1, offsetDays: 0, durationDays: 14, departmentCode: 'OPERATIONS' },
        { name: 'Item Setup & Compliance', sequence: 2, offsetDays: 14, durationDays: 35, departmentCode: 'OPERATIONS' },
        { name: 'Ship & Sell-in', sequence: 3, offsetDays: 49, durationDays: 40, departmentCode: 'OPERATIONS' },
      ],
      milestones: [
        { name: 'Program scope confirmed with retailer', phaseSequence: 1, offsetDays: 14, isGate: true, departmentCode: 'OPERATIONS' },
        { name: 'Item setup accepted', phaseSequence: 2, offsetDays: 49, isGate: true, departmentCode: 'OPERATIONS' },
        { name: 'First shipment delivered', phaseSequence: 3, offsetDays: 89, isGate: false, departmentCode: 'OPERATIONS' },
      ],
      tasks: [
        { title: 'Confirm assortment, pricing and dates', phaseSequence: 1, departmentCode: 'OPERATIONS', offsetDays: 0, durationDays: 10, estimatedHours: 12 },
        { title: 'Margin and promo funding review', phaseSequence: 1, departmentCode: 'FINANCE', offsetDays: 5, durationDays: 9, estimatedHours: 8, dependsOn: [0] },
        { title: 'Complete retailer item forms', phaseSequence: 2, departmentCode: 'OPERATIONS', offsetDays: 14, durationDays: 15, estimatedHours: 20, dependsOn: [0] },
        { title: 'EDI and routing guide compliance check', phaseSequence: 2, departmentCode: 'OPERATIONS', offsetDays: 21, durationDays: 14, estimatedHours: 16, dependsOn: [2] },
        { title: 'Packaging and labeling compliance review', phaseSequence: 2, departmentCode: 'R_AND_D', offsetDays: 21, durationDays: 14, estimatedHours: 12 },
        { title: 'Build inventory to program requirement', phaseSequence: 3, departmentCode: 'OPERATIONS', offsetDays: 49, durationDays: 30, estimatedHours: 24, dependsOn: [3] },
        { title: 'Coordinate routing and first shipment', phaseSequence: 3, departmentCode: 'OPERATIONS', offsetDays: 70, durationDays: 15, estimatedHours: 16, dependsOn: [5] },
        { title: 'Launch support assets', phaseSequence: 3, departmentCode: 'MARKETING', offsetDays: 60, durationDays: 25, estimatedHours: 30, dependsOn: [0] },
      ],
    },
  },
]

// ─── Runner ──────────────────────────────────────────────────

export async function seedProjectsModule(client: PrismaClient = prisma) {
  const summary = { codesSet: 0, unarchived: 0, types: 0, templates: 0, warnings: [] as string[] }

  // 1. Backfill department codes.
  for (const { match, code } of DEPARTMENT_CODES) {
    const dept = await client.department.findFirst({ where: { name: match.name } })
    if (!dept) {
      summary.warnings.push(`Department "${match.name}" not found — code ${code} not assigned.`)
      continue
    }
    if (dept.code !== code) {
      await client.department.update({ where: { id: dept.id }, data: { code } })
      summary.codesSet++
    }
  }

  // 2. Departments the module requires to be active.
  for (const code of MUST_BE_ACTIVE) {
    const dept = await client.department.findFirst({ where: { code } })
    if (dept?.archived) {
      await client.department.update({ where: { id: dept.id }, data: { archived: false } })
      summary.unarchived++
    }
  }

  const byCode = new Map<string, string>()
  for (const d of await client.department.findMany({ where: { code: { not: null } } })) {
    if (d.code) byCode.set(d.code, d.id)
  }

  // 3. Project types.
  for (const t of PROJECT_TYPES) {
    const departmentId = t.departmentCode ? byCode.get(t.departmentCode) ?? null : null
    if (t.departmentCode && !departmentId) {
      summary.warnings.push(`Type ${t.code}: department ${t.departmentCode} missing — left unassigned.`)
    }
    await client.projectType.upsert({
      where: { code: t.code },
      create: {
        code: t.code, label: t.label, icon: t.icon, description: t.description,
        requiredFields: t.requiredFields, sortOrder: t.sortOrder, defaultDepartmentId: departmentId,
      },
      // Label/description/default owner are refreshed so a corrected seed
      // propagates; isActive is NOT touched, so an admin's deactivation sticks.
      update: {
        label: t.label, icon: t.icon, description: t.description,
        requiredFields: t.requiredFields, sortOrder: t.sortOrder, defaultDepartmentId: departmentId,
      },
    })
    summary.types++
  }

  // 4. Templates, linked back as each type's default.
  const org = await client.organization.findFirst()
  for (const tpl of TEMPLATES) {
    const type = await client.projectType.findUnique({ where: { code: tpl.typeCode } })
    if (!type) {
      summary.warnings.push(`Template "${tpl.name}": type ${tpl.typeCode} missing — skipped.`)
      continue
    }
    const existing = await client.projectTemplate.findFirst({ where: { name: tpl.name } })
    const data = {
      name: tpl.name,
      projectTypeId: type.id,
      departmentId: type.defaultDepartmentId,
      description: tpl.description,
      definition: tpl.definition as unknown as object,
      orgId: org?.id ?? null,
    }
    const saved = existing
      ? await client.projectTemplate.update({ where: { id: existing.id }, data })
      : await client.projectTemplate.create({ data })

    if (type.defaultTemplateId !== saved.id) {
      await client.projectType.update({
        where: { id: type.id },
        data: { defaultTemplateId: saved.id },
      })
    }
    summary.templates++
  }

  return summary
}

// Direct execution: `npx tsx prisma/seedProjects.ts`
if (require.main === module) {
  seedProjectsModule()
    .then((s) => {
      console.log(`Department codes set: ${s.codesSet}`)
      console.log(`Departments unarchived: ${s.unarchived}`)
      console.log(`Project types upserted: ${s.types}`)
      console.log(`Templates upserted: ${s.templates}`)
      s.warnings.forEach((w) => console.warn(`WARNING: ${w}`))
    })
    .catch((e) => {
      console.error('Seed failed:', e)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
