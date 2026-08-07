import { PrismaClient } from '@prisma/client'

// ─── Demo projects (spec §11) ────────────────────────────────
// Six realistic initiatives so the module is never empty on a fresh install —
// spanning departments, types and health bands, with phases, milestones, tasks,
// risks, check-in history and activity.
//
// Separate from seedProjects.ts on purpose. That one seeds REFERENCE data
// (departments, project types, templates) which every install needs. This one
// seeds EXAMPLE data, which a real workspace does not want mixed into its
// portfolio. Run it explicitly: `pnpm --filter @nexus/prisma seed:demo`.
//
// Idempotent. Every record is keyed on its project number or a deterministic
// name within a project, so re-running updates rather than duplicating.
//
// §11 assigns two projects to REGULATORY and SUPPLY_CHAIN departments. Neither
// exists in this workspace by decision — supply chain sits inside Operations
// and there is no separate regulatory function — so those lanes map to
// Operations. The project TYPES (REGULATORY, SUPPLY_CHAIN) do exist and are
// used as written.

const prisma = new PrismaClient()

const DAY = 86_400_000
const now = new Date()
const daysFromNow = (n: number) => new Date(now.getTime() + n * DAY)

type DeptCode = 'OPERATIONS' | 'R_AND_D' | 'FINANCE' | 'MARKETING' | 'WAREHOUSE'

interface TaskSpec {
  title: string
  dept: DeptCode
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'COMPLETE'
  due: number
  phase?: string
  blockedDaysAgo?: number
  blockedReason?: string
}

interface ProjectSpec {
  number: string
  title: string
  typeCode: string
  owner: DeptCode
  participating: DeptCode[]
  status: string
  priority: string
  cadence: string
  businessCase: string
  successCriteria: string
  brands: string[]
  retailers: string[]
  startDaysAgo: number
  baselineEndInDays: number
  targetEndInDays: number
  budget?: number
  spend?: number
  phases: { name: string; startDaysAgo: number; endInDays: number; status: string }[]
  milestones: { name: string; dueInDays: number; isGate: boolean; dept?: DeptCode; complete?: boolean; baselineInDays?: number }[]
  tasks: TaskSpec[]
  risks: { title: string; type: string; impact: string; likelihood: string; status: string; dept: DeptCode }[]
  collab?: string
  moduleLink?: { module: string; recordId: string; label: string; linkType: string }
}

const PROJECTS: ProjectSpec[] = [
  {
    number: 'PRJ-2026-0101',
    title: "Carol's Daughter Canada Bilingual Labeling Rollout",
    typeCode: 'BILINGUAL_LABEL',
    // §11 says REGULATORY; that department does not exist here, so Operations
    // owns it — which is where regulatory work actually sits in this business.
    owner: 'OPERATIONS',
    participating: ['MARKETING', 'R_AND_D'],
    status: 'ACTIVE',
    priority: 'HIGH',
    cadence: 'WEEKLY',
    businessCase:
      'Health Canada requires bilingual labelling on all cosmetic products sold in Canada. Non-compliant SKUs cannot ship after the transition date, which puts the full Canadian retail programme at risk.',
    successCriteria:
      'Every Canada-bound SKU carries approved bilingual artwork, first bilingual run lands before the deadline, and no shipment is held at the border.',
    brands: ["Carol's Daughter"],
    retailers: ['Shoppers Drug Mart', 'Walmart Canada'],
    startDaysAgo: 62,
    baselineEndInDays: 34,
    targetEndInDays: 55, // 21 days of slip
    budget: 48_000,
    spend: 31_500,
    phases: [
      { name: 'Regulatory review', startDaysAgo: 62, endInDays: -28, status: 'COMPLETE' },
      { name: 'Artwork adaptation', startDaysAgo: 28, endInDays: 12, status: 'IN_PROGRESS' },
      { name: 'Print proofs & approval', startDaysAgo: -1, endInDays: 34, status: 'NOT_STARTED' },
      { name: 'First production run', startDaysAgo: -1, endInDays: 55, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Regulatory requirements signed off', dueInDays: -30, isGate: true, complete: true, dept: 'OPERATIONS' },
      // The missed gate §11 asks for.
      { name: 'French copy approved', dueInDays: -6, isGate: true, dept: 'MARKETING' },
      { name: 'Artwork files to printer', dueInDays: 12, isGate: false, dept: 'MARKETING' },
      { name: 'Print proof approval', dueInDays: 30, isGate: true, dept: 'OPERATIONS', baselineInDays: 16 },
      { name: 'First bilingual run complete', dueInDays: 55, isGate: true, dept: 'OPERATIONS', baselineInDays: 34 },
    ],
    tasks: [
      { title: 'Pull the full Canada SKU list', dept: 'OPERATIONS', status: 'COMPLETE', due: -50, phase: 'Regulatory review' },
      { title: 'Confirm Health Canada ingredient nomenclature', dept: 'OPERATIONS', status: 'COMPLETE', due: -44, phase: 'Regulatory review' },
      { title: 'Map INCI names to French equivalents', dept: 'R_AND_D', status: 'COMPLETE', due: -38, phase: 'Regulatory review' },
      { title: 'Legal review of claims in both languages', dept: 'OPERATIONS', status: 'COMPLETE', due: -30, phase: 'Regulatory review' },
      { title: 'Translate marketing copy — hair care line', dept: 'MARKETING', status: 'IN_REVIEW', due: -4, phase: 'Artwork adaptation' },
      { title: 'Translate marketing copy — body care line', dept: 'MARKETING', status: 'IN_PROGRESS', due: 3, phase: 'Artwork adaptation' },
      { title: 'Resize label panels for bilingual text', dept: 'MARKETING', status: 'IN_PROGRESS', due: 6, phase: 'Artwork adaptation' },
      { title: 'Verify net contents statement placement', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 10, phase: 'Artwork adaptation' },
      { title: 'Update artwork spec sheets', dept: 'MARKETING', status: 'NOT_STARTED', due: 12, phase: 'Artwork adaptation' },
      { title: 'Send files to printer', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 16, phase: 'Print proofs & approval' },
      { title: 'Review physical proofs', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 26, phase: 'Print proofs & approval' },
      { title: 'Regulatory sign-off on proofs', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 30, phase: 'Print proofs & approval' },
      { title: 'Schedule first bilingual production run', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 40, phase: 'First production run' },
      { title: 'QC first-article inspection', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 50, phase: 'First production run' },
      { title: 'Update Canada SKU master data', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 55, phase: 'First production run' },
      { title: 'Brief the Canadian sales team', dept: 'MARKETING', status: 'NOT_STARTED', due: 55 },
    ],
    risks: [
      { title: 'French copy approval slipping past the printer booking', type: 'RISK', impact: 'HIGH', likelihood: 'LIKELY', status: 'MITIGATING', dept: 'MARKETING' },
      { title: 'Bilingual text does not fit existing label panel sizes', type: 'ISSUE', impact: 'HIGH', likelihood: 'CERTAIN', status: 'OPEN', dept: 'MARKETING' },
      { title: 'Decision: keep one SKU English-only for US-only channels', type: 'DECISION', impact: 'LOW', likelihood: 'CERTAIN', status: 'RESOLVED', dept: 'OPERATIONS' },
    ],
  },
  {
    number: 'PRJ-2026-0102',
    title: 'Ambi Even & Clear Serum — New Formula Development',
    typeCode: 'FORMULA',
    owner: 'R_AND_D',
    participating: ['OPERATIONS', 'FINANCE'],
    status: 'ACTIVE',
    priority: 'HIGH',
    cadence: 'WEEKLY',
    businessCase:
      'The current serum formula uses an actives blend whose cost has risen 40% in eighteen months. A reformulation protects margin and lets us make a cleaner ingredient claim.',
    successCriteria:
      'New formula passes 90-day stability, hits the COGS target, and consumer testing shows no efficacy regression against the current product.',
    brands: ['Ambi'],
    retailers: ['Target', 'Walmart', 'CVS'],
    startDaysAgo: 40,
    baselineEndInDays: 85,
    targetEndInDays: 85,
    budget: 120_000,
    spend: 38_000,
    phases: [
      { name: 'Benchtop development', startDaysAgo: 40, endInDays: 14, status: 'IN_PROGRESS' },
      { name: 'Stability testing', startDaysAgo: -1, endInDays: 60, status: 'NOT_STARTED' },
      { name: 'Consumer validation', startDaysAgo: -1, endInDays: 75, status: 'NOT_STARTED' },
      { name: 'Scale-up & handover', startDaysAgo: -1, endInDays: 85, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Target product profile agreed', dueInDays: -25, isGate: true, complete: true, dept: 'R_AND_D' },
      { name: 'Lead formula selected', dueInDays: 14, isGate: true, dept: 'R_AND_D' },
      { name: '90-day stability started', dueInDays: 20, isGate: false, dept: 'R_AND_D' },
      { name: 'COGS target confirmed', dueInDays: 30, isGate: true, dept: 'FINANCE' },
      { name: 'Consumer test complete', dueInDays: 75, isGate: true, dept: 'MARKETING' },
      { name: 'Handover to operations', dueInDays: 85, isGate: true, dept: 'OPERATIONS' },
    ],
    tasks: [
      { title: 'Benchmark current formula performance', dept: 'R_AND_D', status: 'COMPLETE', due: -32, phase: 'Benchtop development' },
      { title: 'Screen replacement actives', dept: 'R_AND_D', status: 'COMPLETE', due: -24, phase: 'Benchtop development' },
      { title: 'Cost model for each candidate', dept: 'FINANCE', status: 'COMPLETE', due: -18, phase: 'Benchtop development' },
      { title: 'Prepare three lead prototypes', dept: 'R_AND_D', status: 'IN_PROGRESS', due: 5, phase: 'Benchtop development' },
      { title: 'In-vitro efficacy screen', dept: 'R_AND_D', status: 'IN_PROGRESS', due: 10, phase: 'Benchtop development' },
      { title: 'Preservative efficacy testing', dept: 'R_AND_D', status: 'NOT_STARTED', due: 14, phase: 'Benchtop development' },
      { title: 'Confirm supplier capacity for new actives', dept: 'OPERATIONS', status: 'IN_REVIEW', due: 8 },
      { title: 'Set up accelerated stability chambers', dept: 'R_AND_D', status: 'NOT_STARTED', due: 20, phase: 'Stability testing' },
      { title: 'Compatibility testing with current packaging', dept: 'R_AND_D', status: 'NOT_STARTED', due: 34, phase: 'Stability testing' },
      { title: 'Interim 30-day stability read', dept: 'R_AND_D', status: 'NOT_STARTED', due: 50, phase: 'Stability testing' },
      { title: 'Recruit consumer test panel', dept: 'MARKETING', status: 'NOT_STARTED', due: 55, phase: 'Consumer validation' },
      { title: 'Run blinded consumer comparison', dept: 'MARKETING', status: 'NOT_STARTED', due: 70, phase: 'Consumer validation' },
      { title: 'Final COGS reconciliation', dept: 'FINANCE', status: 'NOT_STARTED', due: 30 },
      { title: 'Write manufacturing batch record', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 80, phase: 'Scale-up & handover' },
      { title: 'Pilot scale batch at the CM', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 84, phase: 'Scale-up & handover' },
    ],
    risks: [
      { title: 'Replacement active has a longer lead time than the incumbent', type: 'RISK', impact: 'MEDIUM', likelihood: 'POSSIBLE', status: 'OPEN', dept: 'OPERATIONS' },
      { title: 'Decision: hold the current fragrance rather than reformulate both', type: 'DECISION', impact: 'LOW', likelihood: 'CERTAIN', status: 'RESOLVED', dept: 'R_AND_D' },
    ],
    moduleLink: { module: 'FORMULATION', recordId: 'FORM-AMBI-EC-002', label: 'Ambi Even & Clear serum v2', linkType: 'OUTPUT' },
  },
  {
    number: 'PRJ-2026-0103',
    title: 'Baxter of California EU Packaging Refresh',
    typeCode: 'PACKAGING',
    owner: 'R_AND_D',
    // §11 says SUPPLY_CHAIN; supply chain sits inside Operations here.
    participating: ['MARKETING', 'OPERATIONS'],
    status: 'ACTIVE',
    priority: 'MEDIUM',
    cadence: 'BIWEEKLY',
    businessCase:
      'EU packaging waste rules tighten next year and the current secondary carton fails the recyclability threshold. The refresh also brings the line up to the current brand identity.',
    successCriteria:
      'All EU SKUs ship in compliant packaging before the regulation date, with no increase in landed cost per unit.',
    brands: ['Baxter of California'],
    retailers: ['Sephora EU', 'Douglas'],
    startDaysAgo: 25,
    baselineEndInDays: 95,
    targetEndInDays: 95,
    budget: 65_000,
    spend: 9_200,
    phases: [
      { name: 'Material selection', startDaysAgo: 25, endInDays: 20, status: 'IN_PROGRESS' },
      { name: 'Design & artwork', startDaysAgo: -1, endInDays: 55, status: 'NOT_STARTED' },
      { name: 'Tooling & first article', startDaysAgo: -1, endInDays: 95, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Recyclability target set', dueInDays: -10, isGate: true, complete: true, dept: 'R_AND_D' },
      { name: 'Substrate selected', dueInDays: 20, isGate: true, dept: 'R_AND_D' },
      { name: 'Artwork approved', dueInDays: 55, isGate: true, dept: 'MARKETING' },
      { name: 'First article approved', dueInDays: 90, isGate: true, dept: 'OPERATIONS' },
    ],
    tasks: [
      { title: 'Audit current carton against EU thresholds', dept: 'R_AND_D', status: 'COMPLETE', due: -18, phase: 'Material selection' },
      { title: 'Request substrate samples from three mills', dept: 'OPERATIONS', status: 'COMPLETE', due: -8, phase: 'Material selection' },
      { title: 'Drop-test candidate substrates', dept: 'R_AND_D', status: 'IN_PROGRESS', due: 8, phase: 'Material selection' },
      { title: 'Landed cost comparison', dept: 'OPERATIONS', status: 'IN_PROGRESS', due: 14, phase: 'Material selection' },
      { title: 'Confirm mill minimum order quantities', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 18, phase: 'Material selection' },
      { title: 'Brand identity refresh brief', dept: 'MARKETING', status: 'IN_REVIEW', due: 12, phase: 'Design & artwork' },
      { title: 'Structural design concepts', dept: 'MARKETING', status: 'NOT_STARTED', due: 30, phase: 'Design & artwork' },
      { title: 'Dieline adaptation for all EU SKUs', dept: 'MARKETING', status: 'NOT_STARTED', due: 45, phase: 'Design & artwork' },
      { title: 'Multi-language regulatory panel', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 50, phase: 'Design & artwork' },
      { title: 'Tooling quote and lead time', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 60, phase: 'Tooling & first article' },
      { title: 'Cut new dies', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 80, phase: 'Tooling & first article' },
      { title: 'First article inspection', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 90, phase: 'Tooling & first article' },
      { title: 'Update packaging specs in the system', dept: 'R_AND_D', status: 'NOT_STARTED', due: 95 },
      { title: 'Recyclability certification paperwork', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 88 },
      { title: 'Sunset plan for existing carton stock', dept: 'WAREHOUSE', status: 'NOT_STARTED', due: 92 },
    ],
    risks: [
      { title: 'Recyclable substrate may not survive the EU distribution drop test', type: 'RISK', impact: 'HIGH', likelihood: 'POSSIBLE', status: 'MITIGATING', dept: 'R_AND_D' },
      { title: 'Mill MOQ exceeds a year of EU demand', type: 'RISK', impact: 'MEDIUM', likelihood: 'LIKELY', status: 'OPEN', dept: 'OPERATIONS' },
    ],
    collab: 'EU Packaging & Campaign Programme',
  },
  {
    number: 'PRJ-2026-0104',
    title: 'Secondary Carton Supplier Qualification',
    typeCode: 'SUPPLIER_SOURCING',
    owner: 'OPERATIONS',
    participating: ['FINANCE', 'WAREHOUSE'],
    status: 'AT_RISK',
    priority: 'CRITICAL',
    cadence: 'WEEKLY',
    businessCase:
      'A single carton supplier serves every line. One quality event or capacity crunch stops all secondary packaging, so a qualified second source is a continuity requirement, not an optimisation.',
    successCriteria:
      'A second supplier is approved, has run a qualification batch, and can cover 40% of annual volume within lead time.',
    brands: ['Ambi', "Carol's Daughter", 'AcneFree'],
    retailers: [],
    startDaysAgo: 75,
    baselineEndInDays: 5,
    targetEndInDays: 45, // 40 days of slip — this is the RED project
    budget: 30_000,
    spend: 27_800,
    phases: [
      { name: 'RFQ & shortlist', startDaysAgo: 75, endInDays: -40, status: 'COMPLETE' },
      { name: 'Audit & sampling', startDaysAgo: 40, endInDays: 20, status: 'BLOCKED' },
      { name: 'Qualification run', startDaysAgo: -1, endInDays: 45, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Shortlist agreed', dueInDays: -42, isGate: true, complete: true, dept: 'OPERATIONS' },
      { name: 'Site audit complete', dueInDays: -12, isGate: true, dept: 'OPERATIONS' },
      { name: 'Sample approval', dueInDays: -3, isGate: true, dept: 'OPERATIONS' },
      { name: 'Qualification batch signed off', dueInDays: 45, isGate: true, dept: 'OPERATIONS', baselineInDays: 5 },
    ],
    tasks: [
      { title: 'Draft the RFQ package', dept: 'OPERATIONS', status: 'COMPLETE', due: -68, phase: 'RFQ & shortlist' },
      { title: 'Issue RFQ to six suppliers', dept: 'OPERATIONS', status: 'COMPLETE', due: -60, phase: 'RFQ & shortlist' },
      { title: 'Score commercial responses', dept: 'FINANCE', status: 'COMPLETE', due: -48, phase: 'RFQ & shortlist' },
      { title: 'Shortlist to two suppliers', dept: 'OPERATIONS', status: 'COMPLETE', due: -42, phase: 'RFQ & shortlist' },
      // The two blocked tasks aged 9 days that §11 asks for.
      {
        title: 'Complete supplier B site audit', dept: 'OPERATIONS', status: 'BLOCKED', due: -12,
        phase: 'Audit & sampling', blockedDaysAgo: 9,
        blockedReason: 'Supplier has postponed the audit date twice; no confirmed slot',
      },
      {
        title: 'Approve carton samples from supplier B', dept: 'OPERATIONS', status: 'BLOCKED', due: -3,
        phase: 'Audit & sampling', blockedDaysAgo: 9,
        blockedReason: 'Waiting on the audit before samples can be accepted',
      },
      { title: 'Verify insurance and certifications', dept: 'FINANCE', status: 'IN_PROGRESS', due: 4, phase: 'Audit & sampling' },
      { title: 'Negotiate pricing tiers', dept: 'FINANCE', status: 'IN_REVIEW', due: 10, phase: 'Audit & sampling' },
      { title: 'Confirm warehouse receiving requirements', dept: 'WAREHOUSE', status: 'NOT_STARTED', due: 16, phase: 'Audit & sampling' },
      { title: 'Agree qualification batch size', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 24, phase: 'Qualification run' },
      { title: 'Run the qualification batch', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 38, phase: 'Qualification run' },
      { title: 'Inspect and sign off qualification', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 45, phase: 'Qualification run' },
      { title: 'Add supplier to the approved vendor list', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 45 },
      { title: 'Set up supplier in the finance system', dept: 'FINANCE', status: 'NOT_STARTED', due: 45 },
      { title: 'Draft the dual-source allocation policy', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 42 },
    ],
    risks: [
      { title: 'Only one viable supplier survives qualification, leaving us single-sourced', type: 'RISK', impact: 'CRITICAL', likelihood: 'LIKELY', status: 'OPEN', dept: 'OPERATIONS' },
      { title: 'Supplier B is not engaging with the audit schedule', type: 'ISSUE', impact: 'CRITICAL', likelihood: 'CERTAIN', status: 'OPEN', dept: 'OPERATIONS' },
      { title: 'Qualification slipped past the contract renewal date with the incumbent', type: 'ISSUE', impact: 'HIGH', likelihood: 'CERTAIN', status: 'MITIGATING', dept: 'FINANCE' },
    ],
  },
  {
    number: 'PRJ-2026-0105',
    title: 'AcneFree Walmart OTIF Recovery Program',
    typeCode: 'RETAILER_PROGRAM',
    owner: 'OPERATIONS',
    participating: ['WAREHOUSE', 'FINANCE'],
    status: 'ACTIVE',
    priority: 'HIGH',
    cadence: 'WEEKLY',
    businessCase:
      'OTIF has run below the Walmart threshold for two quarters and is now generating chargebacks. Sustained under-performance puts shelf space at review.',
    successCriteria:
      'OTIF above 95% for three consecutive months and chargebacks down to zero.',
    brands: ['AcneFree'],
    retailers: ['Walmart'],
    startDaysAgo: 30,
    baselineEndInDays: 60,
    targetEndInDays: 68,
    budget: 25_000,
    spend: 11_400,
    phases: [
      { name: 'Root cause analysis', startDaysAgo: 30, endInDays: -2, status: 'COMPLETE' },
      { name: 'Corrective actions', startDaysAgo: 2, endInDays: 40, status: 'IN_PROGRESS' },
      { name: 'Sustained performance window', startDaysAgo: -1, endInDays: 68, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Root causes agreed with Walmart', dueInDays: -2, isGate: true, complete: true, dept: 'OPERATIONS' },
      { name: 'Corrective action plan submitted', dueInDays: 8, isGate: true, dept: 'OPERATIONS' },
      { name: 'First month above threshold', dueInDays: 38, isGate: false, dept: 'OPERATIONS' },
      { name: 'Three-month sustained performance', dueInDays: 68, isGate: true, dept: 'OPERATIONS', baselineInDays: 60 },
    ],
    tasks: [
      { title: 'Pull twelve months of OTIF scorecards', dept: 'OPERATIONS', status: 'COMPLETE', due: -26, phase: 'Root cause analysis' },
      { title: 'Categorise every late or short shipment', dept: 'OPERATIONS', status: 'COMPLETE', due: -18, phase: 'Root cause analysis' },
      { title: 'Quantify chargeback exposure', dept: 'FINANCE', status: 'COMPLETE', due: -12, phase: 'Root cause analysis' },
      { title: 'Warehouse pick accuracy audit', dept: 'WAREHOUSE', status: 'COMPLETE', due: -6, phase: 'Root cause analysis' },
      { title: 'Rebalance safety stock on the top 20 SKUs', dept: 'OPERATIONS', status: 'IN_PROGRESS', due: 6, phase: 'Corrective actions' },
      { title: 'Change carrier for the Bentonville lane', dept: 'OPERATIONS', status: 'IN_REVIEW', due: 12, phase: 'Corrective actions' },
      { title: 'Retrain pickers on the Walmart pallet spec', dept: 'WAREHOUSE', status: 'IN_PROGRESS', due: 14, phase: 'Corrective actions' },
      { title: 'Automate the ASN submission', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 26, phase: 'Corrective actions' },
      { title: 'Weekly OTIF review with the account team', dept: 'OPERATIONS', status: 'IN_PROGRESS', due: 3, phase: 'Corrective actions' },
      { title: 'Dispute historical chargebacks', dept: 'FINANCE', status: 'IN_PROGRESS', due: 20, phase: 'Corrective actions' },
      { title: 'Month one performance review', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 38, phase: 'Sustained performance window' },
      { title: 'Month two performance review', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 55, phase: 'Sustained performance window' },
      { title: 'Present recovery results to Walmart', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 68, phase: 'Sustained performance window' },
      { title: 'Cycle-count the top 20 SKUs weekly', dept: 'WAREHOUSE', status: 'IN_PROGRESS', due: 9, phase: 'Corrective actions' },
      { title: 'Document the new fulfilment SOP', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 32, phase: 'Corrective actions' },
    ],
    risks: [
      { title: 'Carrier change introduces new transit variability', type: 'RISK', impact: 'MEDIUM', likelihood: 'POSSIBLE', status: 'MITIGATING', dept: 'OPERATIONS' },
      { title: 'A stockout on the top SKU would reset the sustained window', type: 'RISK', impact: 'HIGH', likelihood: 'POSSIBLE', status: 'OPEN', dept: 'OPERATIONS' },
    ],
  },
  {
    number: 'PRJ-2026-0106',
    title: 'Q3 Launch Campaign Support — Dermablend',
    typeCode: 'MARKETING_CAMPAIGN',
    owner: 'MARKETING',
    participating: ['R_AND_D', 'OPERATIONS'],
    status: 'ACTIVE',
    priority: 'MEDIUM',
    cadence: 'BIWEEKLY',
    businessCase:
      'The Q3 shade extension needs campaign assets, sampling and retailer support in place before the on-shelf date, or the launch lands without demand behind it.',
    successCriteria:
      'All assets delivered two weeks before on-shelf, sampling live at launch, and retailer pages updated on day one.',
    brands: ['Dermablend'],
    retailers: ['Ulta', 'Sephora'],
    startDaysAgo: 18,
    baselineEndInDays: 72,
    targetEndInDays: 72,
    budget: 90_000,
    spend: 12_600,
    phases: [
      { name: 'Creative development', startDaysAgo: 18, endInDays: 28, status: 'IN_PROGRESS' },
      { name: 'Production & assets', startDaysAgo: -1, endInDays: 55, status: 'NOT_STARTED' },
      { name: 'Retail activation', startDaysAgo: -1, endInDays: 72, status: 'NOT_STARTED' },
    ],
    milestones: [
      { name: 'Campaign concept approved', dueInDays: 10, isGate: true, dept: 'MARKETING' },
      { name: 'Shoot complete', dueInDays: 34, isGate: false, dept: 'MARKETING' },
      { name: 'Assets delivered to retailers', dueInDays: 58, isGate: true, dept: 'MARKETING' },
      { name: 'On shelf', dueInDays: 72, isGate: true, dept: 'OPERATIONS' },
    ],
    tasks: [
      { title: 'Campaign brief and objectives', dept: 'MARKETING', status: 'COMPLETE', due: -10, phase: 'Creative development' },
      { title: 'Shade story and claims review', dept: 'R_AND_D', status: 'COMPLETE', due: -4, phase: 'Creative development' },
      { title: 'Creative concepts round 1', dept: 'MARKETING', status: 'IN_REVIEW', due: 4, phase: 'Creative development' },
      { title: 'Model casting for the shade range', dept: 'MARKETING', status: 'IN_PROGRESS', due: 12, phase: 'Creative development' },
      { title: 'Confirm claims substantiation for campaign copy', dept: 'R_AND_D', status: 'IN_PROGRESS', due: 16, phase: 'Creative development' },
      { title: 'Book photography and studio', dept: 'MARKETING', status: 'NOT_STARTED', due: 22, phase: 'Creative development' },
      { title: 'Production shoot', dept: 'MARKETING', status: 'NOT_STARTED', due: 34, phase: 'Production & assets' },
      { title: 'Retouch and asset delivery', dept: 'MARKETING', status: 'NOT_STARTED', due: 45, phase: 'Production & assets' },
      { title: 'Adapt assets to retailer specs', dept: 'MARKETING', status: 'NOT_STARTED', due: 52, phase: 'Production & assets' },
      { title: 'Sampling programme quantities', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 40, phase: 'Production & assets' },
      { title: 'Ship samples to retailers', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 62, phase: 'Retail activation' },
      { title: 'Update retailer product pages', dept: 'MARKETING', status: 'NOT_STARTED', due: 68, phase: 'Retail activation' },
      { title: 'Launch-day social activation', dept: 'MARKETING', status: 'NOT_STARTED', due: 72, phase: 'Retail activation' },
      { title: 'Influencer seeding list', dept: 'MARKETING', status: 'NOT_STARTED', due: 56, phase: 'Retail activation' },
      { title: 'Confirm launch inventory is allocated', dept: 'OPERATIONS', status: 'NOT_STARTED', due: 64, phase: 'Retail activation' },
    ],
    risks: [
      { title: 'Claims substantiation may not clear in time for the shoot', type: 'RISK', impact: 'HIGH', likelihood: 'POSSIBLE', status: 'MITIGATING', dept: 'R_AND_D' },
      { title: 'Decision: run sampling through Ulta only in Q3', type: 'DECISION', impact: 'LOW', likelihood: 'CERTAIN', status: 'RESOLVED', dept: 'MARKETING' },
    ],
    collab: 'EU Packaging & Campaign Programme',
    moduleLink: { module: 'BRIEF', recordId: 'BRIEF-DB-Q3-SHADE', label: 'Dermablend Q3 shade extension brief', linkType: 'SOURCE' },
  },
]

async function main() {
  const org = await prisma.organization.findFirst()
  if (!org) throw new Error('No organization found — run the main seed first.')

  const departments = await prisma.department.findMany({ where: { orgId: org.id } })
  const deptByCode = new Map(departments.filter((d) => d.code).map((d) => [d.code!, d]))
  const types = await prisma.projectType.findMany()
  const typeByCode = new Map(types.map((t) => [t.code, t]))
  const members = await prisma.member.findMany({ where: { orgId: org.id } })
  if (members.length === 0) throw new Error('No members found — run the main seed first.')

  const dept = (code: DeptCode) => {
    const d = deptByCode.get(code)
    if (!d) throw new Error(`Department ${code} not found`)
    return d
  }
  // Spread ownership deterministically so the workload view has shape rather
  // than every task landing on one person.
  const memberFor = (i: number) => members[i % members.length]!

  let taskCursor = 0
  const collabIds = new Map<string, string>()

  for (const spec of PROJECTS) {
    const type = typeByCode.get(spec.typeCode)
    const owner = dept(spec.owner)

    const base = {
      title: spec.title,
      description: spec.businessCase.slice(0, 200),
      businessCase: spec.businessCase,
      successCriteria: spec.successCriteria,
      status: spec.status,
      priority: spec.priority,
      orgId: org.id,
      ownerDepartmentId: owner.id,
      projectTypeId: type?.id ?? null,
      projectManagerId: memberFor(PROJECTS.indexOf(spec)).id,
      executiveSponsorId: members[0]!.id,
      brands: spec.brands,
      retailers: spec.retailers,
      startDate: daysFromNow(-spec.startDaysAgo),
      baselineEndDate: daysFromNow(spec.baselineEndInDays),
      targetEndDate: daysFromNow(spec.targetEndInDays),
      baselinedAt: daysFromNow(-spec.startDaysAgo + 2),
      budgetAmount: spec.budget ?? null,
      actualSpend: spec.spend ?? null,
      checkinCadence: spec.cadence,
      lastActivityAt: daysFromNow(-1),
    }

    // Keyed on the project number so a re-run updates in place.
    const existing = await prisma.project.findFirst({ where: { projectNumber: spec.number } })
    const project = existing
      ? await prisma.project.update({ where: { id: existing.id }, data: base })
      : await prisma.project.create({ data: { ...base, projectNumber: spec.number } })

    // ── Departments ──
    for (const [i, code] of [spec.owner, ...spec.participating].entries()) {
      const d = dept(code)
      await prisma.projectDepartment.upsert({
        where: { projectId_departmentId: { projectId: project.id, departmentId: d.id } },
        create: {
          projectId: project.id, departmentId: d.id,
          role: i === 0 ? 'OWNER' : 'CONTRIBUTOR',
          laneLeadId: memberFor(i + PROJECTS.indexOf(spec)).id,
        },
        update: { role: i === 0 ? 'OWNER' : 'CONTRIBUTOR' },
      })
    }

    // ── Phases ──
    const phaseIds = new Map<string, string>()
    for (const [i, p] of spec.phases.entries()) {
      const found = await prisma.projectPhase.findFirst({ where: { projectId: project.id, name: p.name } })
      const data = {
        sequence: i,
        status: p.status,
        startDate: p.startDaysAgo >= 0 ? daysFromNow(-p.startDaysAgo) : null,
        endDate: daysFromNow(p.endInDays),
        baselineStart: p.startDaysAgo >= 0 ? daysFromNow(-p.startDaysAgo) : null,
        baselineEnd: daysFromNow(p.endInDays),
      }
      const phase = found
        ? await prisma.projectPhase.update({ where: { id: found.id }, data })
        : await prisma.projectPhase.create({ data: { ...data, projectId: project.id, name: p.name } })
      phaseIds.set(p.name, phase.id)
    }

    // ── Milestones ──
    for (const m of spec.milestones) {
      const found = await prisma.projectMilestone.findFirst({ where: { projectId: project.id, name: m.name } })
      const data = {
        dueDate: daysFromNow(m.dueInDays),
        baselineDate: daysFromNow(m.baselineInDays ?? m.dueInDays),
        completedDate: m.complete ? daysFromNow(m.dueInDays - 1) : null,
        status: m.complete ? 'COMPLETE' : 'PENDING',
        isGate: m.isGate,
        departmentId: m.dept ? dept(m.dept).id : null,
      }
      if (found) await prisma.projectMilestone.update({ where: { id: found.id }, data })
      else await prisma.projectMilestone.create({ data: { ...data, projectId: project.id, name: m.name } })
    }

    // ── Tasks ──
    for (const [i, t] of spec.tasks.entries()) {
      const found = await prisma.task.findFirst({ where: { projectId: project.id, title: t.title } })
      const data = {
        status: t.status,
        departmentId: dept(t.dept).id,
        ownerId: memberFor(taskCursor++).id,
        dueDate: daysFromNow(t.due),
        phaseId: t.phase ? phaseIds.get(t.phase) ?? null : null,
        percentComplete: t.status === 'COMPLETE' ? 100 : t.status === 'IN_REVIEW' ? 80 : t.status === 'IN_PROGRESS' ? 45 : 0,
        completedAt: t.status === 'COMPLETE' ? daysFromNow(t.due) : null,
        blockedSince: t.blockedDaysAgo ? daysFromNow(-t.blockedDaysAgo) : null,
        blockedReason: t.blockedReason ?? null,
        estimatedHours: 4 + (i % 5) * 2,
      }
      if (found) await prisma.task.update({ where: { id: found.id }, data })
      else {
        await prisma.task.create({
          data: { ...data, projectId: project.id, title: t.title, taskNumber: i + 1 },
        })
      }
    }
    await prisma.project.update({ where: { id: project.id }, data: { taskCounter: spec.tasks.length } })

    // ── Risks ──
    for (const r of spec.risks) {
      const found = await prisma.projectRisk.findFirst({ where: { projectId: project.id, title: r.title } })
      const data = {
        recordType: r.type, impact: r.impact, likelihood: r.likelihood, status: r.status,
        departmentId: dept(r.dept).id,
        ownerId: memberFor(taskCursor++).id,
        resolvedAt: r.status === 'RESOLVED' ? daysFromNow(-3) : null,
      }
      if (found) await prisma.projectRisk.update({ where: { id: found.id }, data })
      else await prisma.projectRisk.create({ data: { ...data, projectId: project.id, title: r.title } })
    }

    // ── Three weeks of check-in history ──
    // Weekly, oldest answered and recent ones tapering off, so the compliance
    // panel has something to show rather than a flat 100%.
    //
    // Cleared first, not upserted. The unique key is (project, department,
    // dueAt) and dueAt is relative to the run time, so every re-run produced a
    // fresh set of keys and the history silently tripled. Deleting the demo
    // project's check-ins and rebuilding them is idempotent whenever it runs.
    await prisma.projectCheckin.deleteMany({ where: { projectId: project.id } })

    const laneCodes = [spec.owner, ...spec.participating]
    for (let week = 3; week >= 1; week--) {
      for (const [li, code] of laneCodes.entries()) {
        const d = dept(code)
        const requestedAt = daysFromNow(-week * 7)
        const dueAt = daysFromNow(-week * 7 + 2)
        // The most recent week is partly unanswered — a live-looking backlog.
        const answered = week > 1 || li === 0
        await prisma.projectCheckin.create({
          data: {
            projectId: project.id, departmentId: d.id, requestedAt, dueAt,
            status: answered ? 'RESPONDED' : 'OVERDUE',
            respondedAt: answered ? daysFromNow(-week * 7 + 1) : null,
            respondentId: answered ? memberFor(li).id : null,
            progressSummary: answered ? `Week ${4 - week}: ${d.name} lane progressing to plan.` : null,
            blockers: answered && week === 2 ? 'Waiting on inputs from another lane.' : null,
            confidence: answered ? (week === 1 ? 'ON_TRACK' : week === 2 ? 'AT_RISK' : 'ON_TRACK') : null,
            reminderCount: answered ? 0 : 3,
          },
        })
      }
    }

    // ── Activity ──
    const seedActivity = [
      { action: 'CREATED', summary: `${spec.number} "${spec.title}" created`, ago: spec.startDaysAgo },
      { action: 'BASELINED', summary: 'Baseline dates frozen', ago: spec.startDaysAgo - 2 },
      { action: 'DEPARTMENT_ADDED', summary: `${dept(spec.participating[0]!).name} joined as a contributor`, ago: spec.startDaysAgo - 3 },
    ]
    if (spec.targetEndInDays > spec.baselineEndInDays) {
      seedActivity.push({
        action: 'HEALTH_CHANGED',
        summary: `Health GREEN → AMBER: ${spec.targetEndInDays - spec.baselineEndInDays} days past baseline`,
        ago: 6,
      })
    }
    for (const a of seedActivity) {
      const found = await prisma.projectActivity.findFirst({
        where: { projectId: project.id, action: a.action, summary: a.summary },
      })
      if (!found) {
        await prisma.projectActivity.create({
          data: {
            projectId: project.id, actorId: members[0]!.id,
            entityType: 'PROJECT', entityId: project.id,
            action: a.action, summary: a.summary,
            createdAt: daysFromNow(-Math.max(0, a.ago)),
          },
        })
      }
    }

    // ── Module link ──
    if (spec.moduleLink) {
      await prisma.projectModuleLink.upsert({
        where: {
          projectId_module_recordId: {
            projectId: project.id, module: spec.moduleLink.module, recordId: spec.moduleLink.recordId,
          },
        },
        create: { projectId: project.id, ...spec.moduleLink },
        update: { label: spec.moduleLink.label, linkType: spec.moduleLink.linkType },
      })
    }

    // ── Collab ──
    if (spec.collab) {
      let collabId = collabIds.get(spec.collab)
      if (!collabId) {
        const found = await prisma.coworkSpace.findFirst({ where: { name: spec.collab } })
        const space = found ?? (await prisma.coworkSpace.create({
          data: {
            name: spec.collab,
            description: 'Cross-department programme spanning packaging and campaign work',
            type: 'INITIATIVE',
            deptNames: [dept('MARKETING').name, dept('R_AND_D').name, dept('OPERATIONS').name],
            memberIds: members.slice(0, 3).map((m) => m.id),
          },
        }))
        collabId = space.id
        collabIds.set(spec.collab, collabId)
      }
      await prisma.collabProjectLink.upsert({
        where: { coworkSpaceId_projectId: { coworkSpaceId: collabId, projectId: project.id } },
        create: { coworkSpaceId: collabId, projectId: project.id, linkedById: members[0]!.id },
        update: { unlinkedAt: null },
      })
    }

    console.log(`  ${spec.number}  ${spec.title}`)
  }

  // Advance the project-number counter past the block this seed claimed.
  // Without this the allocator hands out PRJ-2026-0101 next and collides with a
  // seeded project — which is exactly what happened the first time this ran.
  // The allocator now steps over taken numbers on its own, but leaving the
  // counter behind would make every real create do six wasted round trips.
  const highest = Math.max(
    ...PROJECTS.map((p) => Number(p.number.split('-')[2])).filter(Number.isFinite),
  )
  const year = Number(PROJECTS[0]!.number.split('-')[1])
  const counter = await prisma.projectNumberCounter.findUnique({
    where: { orgId_year: { orgId: org.id, year } },
  })
  if (!counter) {
    await prisma.projectNumberCounter.create({ data: { orgId: org.id, year, lastValue: highest } })
  } else if (counter.lastValue < highest) {
    await prisma.projectNumberCounter.update({
      where: { orgId_year: { orgId: org.id, year } },
      data: { lastValue: highest },
    })
  }
  console.log(`Project number counter advanced to ${highest}.`)

  console.log(`\nSeeded ${PROJECTS.length} demo projects.`)
  console.log('Health and percent-complete are derived — they fill in on the next recompute.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
