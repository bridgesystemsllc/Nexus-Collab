// ─── Artwork Tracker Data & Constants ─────────────────────────────

// ─── Types ────────────────────────────────────────────────────────

export type ArtworkStatus =
  | 'Draft' | 'In Review' | 'Revisions Requested' | 'Legal Review'
  | 'Regulatory Review' | 'Retailer Submitted' | 'Retailer Approved'
  | 'Printer Submitted' | 'Printer Approved' | 'Final Approved'
  | 'On Hold' | 'Archived'

export interface ArtworkProject {
  id: string
  artworkName: string
  brand: string
  subBrand?: string
  productName: string
  skus: { sku: string; upc: string; channel: string }[]
  productFormat: string
  netWeight: string
  channels: string[]
  isOTC: boolean
  linkedBriefId?: string
  linkedNPDId?: string
  linkedFormulationId?: string
  // Specs
  labelType: string
  numberOfColors: string
  pantoneColors: { pms: string; name: string; purpose: string }[]
  specialFinishes: string[]
  dielineSource: string
  artworkFileFormat: string
  bleed: string
  safetyMargin: string
  resolution: string
  colorProfile: string
  printerName: string
  printerContact: string
  printerSubmissionFormat: string
  // Label content
  productNameOnLabel: string
  brandNameOnLabel: string
  tagline: string
  netWeightStatement: string
  countryOfOrigin: string
  distributedByStatement: string
  website: string
  lotCodeFormat: string
  paoSymbol: string
  frontPanelClaims: string
  backPanelClaims: string
  certifications: string[]
  inciList: string
  fragranceDisclosure: string
  allergenDisclosure: string
  targetRetailers: string[]
  retailerComplianceNotes: string
  // OTC
  activeIngredients?: { name: string; percentage: string }[]
  indications?: string
  warnings?: string
  directions?: string
  inactiveIngredients?: string
  questionsPhone?: string
  // Workflow
  approvalChain: {
    sequence: number
    role: string
    assignedName: string
    required: boolean
  }[]
  notifications: {
    onVersionSubmit: boolean
    reminderDays: number
    onFinalApproval: boolean
    notifyPrinter: boolean
  }
  // Computed
  currentVersion: string
  status: ArtworkStatus
  submissionDueDate: string
  // Versions, approvals, submissions stored in separate arrays
  versions: ArtworkVersion[]
  submissions: ArtworkSubmission[]
  complianceChecklist: ComplianceItem[]
  activityLog: { user: string; action: string; timestamp: string; version?: string }[]
  createdBy: string
  createdAt: string
}

export interface ArtworkVersion {
  id: string
  versionNumber: string
  versionType: 'patch' | 'minor'
  artworkFileName: string
  artworkFileUrl: string
  changeSummary: string
  changeTypes: string[]
  uploadedBy: string
  uploadedAt: string
  resetApprovals: boolean
  approvals: ArtworkApproval[]
  status: ArtworkStatus
}

export interface ArtworkApproval {
  id: string
  sequence: number
  role: string
  assignedName: string
  status: 'pending' | 'approved' | 'rejected' | 'skipped'
  decidedAt?: string
  comments?: string
}

export interface ArtworkSubmission {
  id: string
  submittedTo: string
  submissionType: string
  versionNumber: string
  method: string
  submittedBy: string
  submittedAt: string
  referenceNumber: string
  responseDueDate: string
  responseDate: string
  status: 'Submitted' | 'Acknowledged' | 'In Review' | 'Approved' | 'Rejected' | 'Changes Requested'
  submissionNotes: string
  responseNotes: string
}

export interface ComplianceItem {
  id: string
  section: 'A' | 'B' | 'C' | 'D'
  itemNumber: string
  description: string
  retailer?: string
  status: 'pass' | 'fail' | 'na' | 'pending'
  notes: string
  updatedBy?: string
  updatedAt?: string
}

// ─── Status Color Map ─────────────────────────────────────────────

export const ARTWORK_STATUS_COLORS: Record<string, string> = {
  'Draft': '#6B7280',
  'In Review': '#3B82F6',
  'Revisions Requested': '#F59E0B',
  'Legal Review': '#8B5CF6',
  'Regulatory Review': '#7C3AED',
  'Retailer Submitted': '#06B6D4',
  'Retailer Approved': '#0D9488',
  'Printer Submitted': '#F97316',
  'Printer Approved': '#65A30D',
  'Final Approved': '#10B981',
  'On Hold': '#EF4444',
  'Archived': '#475569',
}

export const ALL_STATUSES: ArtworkStatus[] = [
  'Draft', 'In Review', 'Revisions Requested', 'Legal Review',
  'Regulatory Review', 'Retailer Submitted', 'Retailer Approved',
  'Printer Submitted', 'Printer Approved', 'Final Approved',
  'On Hold', 'Archived',
]

// ─── Constants ────────────────────────────────────────────────────

export const PRODUCT_FORMATS = [
  'Tube', 'Jar', 'Bottle', 'Carton', 'Pouch', 'Can', 'Stick', 'Palette', 'Kit', 'Other'
]

export const CHANNELS = ['Retail', 'Amazon', 'DTC', 'Club', 'International']

export const LABEL_TYPES = [
  'Wrap Label', 'Front/Back Label', 'Screen Print', 'Heat Transfer',
  'Foil Stamp', 'Direct Print', 'Shrink Sleeve', 'IML'
]

export const SPECIAL_FINISHES = [
  'Gloss', 'Matte', 'Soft Touch', 'Foil (Gold)', 'Foil (Silver)', 'Foil (Rose Gold)',
  'Emboss', 'Deboss', 'Spot UV', 'Holographic', 'None'
]

export const DIELINE_SOURCES = ['CM Provided', 'Internal', 'Packaging Vendor', 'Third Party']

export const ARTWORK_FILE_FORMATS = ['AI (Illustrator)', 'InDesign IDML', 'PDF/X-4', 'PDF/X-1a', 'Other']

export const COLOR_PROFILES = ['CMYK (SWOP)', 'CMYK (GRACoL)', 'RGB sRGB', 'Pantone-only', 'Other']

export const FRAGRANCE_OPTIONS = ['Fragrance', 'Natural Fragrance', 'Parfum', 'Fragrance-Free', 'Unscented']

export const CERTIFICATION_OPTIONS = [
  'Clean at Sephora', 'EWG Verified', 'Leaping Bunny', 'PETA',
  'USDA Organic', 'FSC', 'Recyclable', 'PCR Content', 'NSF', 'Other'
]

export const TARGET_RETAILERS = [
  'Walmart', 'Target', 'CVS', 'Walgreens', 'Rite Aid', 'Amazon',
  'Ulta', 'Sephora', 'Sally Beauty', 'Costco', "Sam's Club", 'Nordstrom', 'Other'
]

export const CHANGE_TYPES = [
  'INCI Correction', 'Claims Update', 'OTC Drug Facts', 'Color Correction',
  'Dieline Update', 'Copy Change', 'Regulatory Revision', 'Retailer Requirement',
  'Barcode/UPC', 'Legal Update', 'General Revision'
]

export const SUBMISSION_TYPES = [
  'Retailer Review', 'Amazon Listing', 'Printer Proof',
  'Regulatory Filing', 'Legal Review', 'FDA Review'
]

export const SUBMISSION_METHODS = [
  'Email', 'Vendor Portal', 'File Transfer', 'Physical Sample', 'FTP'
]

export const DEFAULT_APPROVAL_CHAIN = [
  { sequence: 1, role: 'R&D / Regulatory Lead', assignedName: 'Jean Marc', required: true },
  { sequence: 2, role: 'Brand Manager', assignedName: '', required: true },
  { sequence: 3, role: 'Operations Director', assignedName: 'Steven - OD', required: true },
  { sequence: 4, role: 'Legal Review', assignedName: '', required: false },
  { sequence: 5, role: 'Head of Business', assignedName: 'Tauro', required: true },
]

export type ArtworkFormData = typeof EMPTY_ARTWORK_FORM
export type PantoneColor = ArtworkFormData['pantoneColors'][number]
export type ActiveIngredient = ArtworkFormData['activeIngredients'][number]
export type ApprovalChainRow = ArtworkFormData['approvalChain'][number]

// ─── Default Compliance Checklist ─────────────────────────────────

export const DEFAULT_COMPLIANCE_ITEMS: Omit<ComplianceItem, 'id'>[] = [
  // Section A — Regulatory
  { section: 'A', itemNumber: 'A1', description: 'INCI list in correct descending order of concentration', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A2', description: 'Net weight statement in correct format (both oz and g)', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A3', description: '"Distributed by" statement present with full address', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A4', description: 'Country of origin statement present', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A5', description: 'Lot/batch code placement defined', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A6', description: 'PAO (Period After Opening) symbol present if applicable', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A7', description: 'No prohibited claims (drug claims on cosmetic products)', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A8', description: 'OTC Drug Facts box present and complete (if OTC)', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A9', description: 'Active ingredients listed with correct percentages (if OTC)', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A10', description: 'Fragrance disclosure correct', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A11', description: 'Allergen disclosure present if required', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A12', description: 'All certification seals confirmed current and authorized', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A13', description: 'No unsubstantiated clinical claims', status: 'pending', notes: '' },
  { section: 'A', itemNumber: 'A14', description: 'Environmental/sustainability claims substantiated', status: 'pending', notes: '' },
  // Section B — Print & Technical
  { section: 'B', itemNumber: 'B1', description: 'Barcode (UPC/EAN) scannable at correct size (min 80% magnification)', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B2', description: 'Barcode quiet zones maintained', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B3', description: 'All Pantone colors specified and verified', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B4', description: 'CMYK build correct for all non-Pantone elements', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B5', description: 'Minimum font size met (typically 6pt minimum for regulatory text)', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B6', description: 'Bleed and safety margins correct per spec', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B7', description: 'All images at required resolution (300 DPI+)', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B8', description: 'Correct color profile embedded (CMYK/Pantone)', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B9', description: 'Dieline matches final packaging specs from CM', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B10', description: 'Special finishes (foil, gloss, matte) correctly specified in file', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B11', description: 'File format matches printer requirement (PDF/X-4 etc.)', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B12', description: 'All fonts embedded or outlined', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B13', description: 'No RGB elements in print file', status: 'pending', notes: '' },
  { section: 'B', itemNumber: 'B14', description: 'Spot colors correctly named and defined', status: 'pending', notes: '' },
  // Section D — Brand Standards
  { section: 'D', itemNumber: 'D1', description: 'Brand logo is approved version (not distorted, not outdated)', status: 'pending', notes: '' },
  { section: 'D', itemNumber: 'D2', description: 'Brand colors match current standards', status: 'pending', notes: '' },
  { section: 'D', itemNumber: 'D3', description: 'Typography matches brand font standards', status: 'pending', notes: '' },
  { section: 'D', itemNumber: 'D4', description: 'Brand voice and claims align with brand positioning', status: 'pending', notes: '' },
  { section: 'D', itemNumber: 'D5', description: 'Product name spelled correctly and consistently', status: 'pending', notes: '' },
  { section: 'D', itemNumber: 'D6', description: 'Sub-brand callout consistent with product line', status: 'pending', notes: '' },
]

// ─── Empty Form ───────────────────────────────────────────────────

export const EMPTY_ARTWORK_FORM = {
  artworkName: '',
  brand: '',
  subBrand: '',
  productName: '',
  skus: [{ sku: '', upc: '', channel: '' }],
  productFormat: '',
  netWeight: '',
  channels: [] as string[],
  isOTC: false,
  linkedBriefId: '',
  linkedNPDId: '',
  linkedFormulationId: '',
  labelType: '',
  numberOfColors: '',
  pantoneColors: [{ pms: '', name: '', purpose: '' }],
  specialFinishes: [] as string[],
  dielineSource: '',
  artworkFileFormat: '',
  bleed: '0.125"',
  safetyMargin: '0.0625"',
  resolution: '300 DPI minimum',
  colorProfile: 'CMYK (SWOP)',
  printerName: '',
  printerContact: '',
  printerSubmissionFormat: '',
  productNameOnLabel: '',
  brandNameOnLabel: '',
  tagline: '',
  netWeightStatement: '',
  countryOfOrigin: 'Made in USA',
  distributedByStatement: 'Distributed by KarEve, LLC, New York, NY 10001',
  website: '',
  lotCodeFormat: '',
  paoSymbol: '',
  frontPanelClaims: '',
  backPanelClaims: '',
  certifications: [] as string[],
  inciList: '',
  fragranceDisclosure: '',
  allergenDisclosure: '',
  targetRetailers: [] as string[],
  retailerComplianceNotes: '',
  activeIngredients: [] as { name: string; percentage: string }[],
  indications: '',
  warnings: '',
  directions: '',
  inactiveIngredients: '',
  questionsPhone: '',
  approvalChain: DEFAULT_APPROVAL_CHAIN.map(a => ({ ...a })),
  notifications: {
    onVersionSubmit: true,
    reminderDays: 3,
    onFinalApproval: true,
    notifyPrinter: true,
  },
  submissionDueDate: '',
}

// ─── Helpers ──────────────────────────────────────────────────────

export function getApprovalChainSummary(approvals: ArtworkApproval[]): {
  approved: number
  pending: number
  rejected: number
  total: number
} {
  const approved = approvals.filter(a => a.status === 'approved').length
  const pending = approvals.filter(a => a.status === 'pending').length
  const rejected = approvals.filter(a => a.status === 'rejected').length
  return { approved, pending, rejected, total: approvals.length }
}

export function getComplianceProgress(items: ComplianceItem[]): {
  completed: number
  total: number
  failing: number
  percent: number
} {
  const total = items.filter(i => i.status !== 'na').length
  const completed = items.filter(i => i.status === 'pass' || i.status === 'fail').length
  const failing = items.filter(i => i.status === 'fail').length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { completed, total, failing, percent }
}

export function generateRetailerComplianceItems(retailers: string[]): Omit<ComplianceItem, 'id'>[] {
  const items: Omit<ComplianceItem, 'id'>[] = []
  const retailerReqs: Record<string, string[]> = {
    'Walmart': [
      'Item number on back panel, right-justified, min 6pt',
      '"Distributed by" statement present',
      'Walmart-specific UPC placement confirmed',
      'Case pack info correct',
    ],
    'Amazon': [
      'ASIN assignment confirmed',
      '"Sold by" statement on bundle if applicable',
      'Suffocation warning on bags >5"',
      'FBA label placement (1" × 1" minimum)',
      'Amazon-restricted claims removed',
    ],
    'Target': [
      'Target item number placement',
      'Sustainability callouts (if applicable)',
      'FSC certification on carton',
    ],
    'CVS': [
      'CVS item number on back panel',
      'ExtraCare loyalty callout if applicable',
    ],
    'Sephora': [
      'Sephora clean seal (if applicable)',
      'Ingredient highlight callout',
      'Full INCI on pack',
    ],
  }

  let counter = 1
  for (const retailer of retailers) {
    const reqs = retailerReqs[retailer] || []
    for (const req of reqs) {
      items.push({
        section: 'C',
        itemNumber: `C${counter}`,
        description: req,
        retailer,
        status: 'pending',
        notes: '',
      })
      counter++
    }
  }
  return items
}
