// ─────────────────────────────────────────────────────────────
// Component Sourcing — Types, Constants & Helpers
// ─────────────────────────────────────────────────────────────

// ── Union / Literal Types ────────────────────────────────────

export type ComponentType =
  | 'Primary Packaging'
  | 'Secondary Packaging'
  | 'Closures'
  | 'Labels & Decoration'
  | 'Raw Materials'
  | 'Accessories'
  | 'Regulatory Components';

export type FeasibilityStatus =
  | 'Concept'
  | 'Feasibility Review'
  | 'Sampling'
  | 'Sample Testing'
  | 'Compatibility Testing'
  | 'Cost Negotiation'
  | 'Approved'
  | 'Conditionally Approved'
  | 'Active'
  | 'Discontinued'
  | 'On Hold'
  | 'Replaced';

export type CompatibilityResult =
  | 'pass'
  | 'fail'
  | 'conditional'
  | 'not_tested'
  | 'in_progress';

export type VendorStatus = 'Primary' | 'Secondary' | 'Evaluating' | 'Disqualified';

export type RiskSeverity = 'Low' | 'Medium' | 'High' | 'Critical';

export type RiskStatus = 'Open' | 'Mitigated' | 'Accepted' | 'Closed';

export type MilestoneStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Skipped' | 'Overdue';

// ── Interfaces ───────────────────────────────────────────────

export interface ComponentVendor {
  vendorName: string;
  vendorType: string;
  vendorStatus: VendorStatus;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  leadTimeWeeks: number;
  vendorPartNumber: string;
  certifications: string[];
  paymentTerms: string;
  incoterms: string;
  port: string;
  ratingOverall: number;
  ratingQuality: number;
  ratingCommunication: number;
  ratingDelivery: number;
  ratingCost: number;
  notes: string;
}

export interface MOQTier {
  moqQuantity: number;
  unitCost: number;
  toolingCost: number;
  sampleCost: number;
  shippingCostPerUnit: number;
  dutyRatePct: number;
  totalLandedCost: number; // computed
  effectiveDate: string;
  expiryDate: string;
  quoteReference: string;
}

export interface ProductAssignment {
  productName: string;
  brand: string;
  sku: string;
  channels: string[];
  formulaReference: string;
  annualVolumeUnits: number;
  assignmentStatus: string;
  notes: string;
}

export interface CompatibilityTest {
  productName: string;
  formulaReference: string;
  testType: string;
  testDate: string;
  lab: string;
  testDuration: string;
  testProtocol: string;
  status: CompatibilityResult;
  resultNotes: string;
  reportFileUrl: string;
  followUpRequired: boolean;
}

export interface FeasibilityMilestone {
  milestoneName: string;
  targetDate: string;
  actualDate: string;
  status: MilestoneStatus;
  completedBy: string;
  notes: string;
  isCustom: boolean;
}

export interface ComponentRisk {
  description: string;
  severity: RiskSeverity;
  mitigationPlan: string;
  status: RiskStatus;
  loggedBy: string;
  loggedAt: string;
}

export interface ComponentFile {
  name: string;
  url: string;
  category: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Component {
  id: string;
  partNumber: string;
  name: string;
  type: ComponentType;
  subType: string;
  brands: string[];
  description: string;
  status: FeasibilityStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  isReplacement: boolean;
  replacingComponentId: string;
  tags: string[];

  // Physical
  material: string;
  color: string;
  finish: string;
  weightEmpty: string;
  countryOfManufacture: string;
  pcrContentPct: number;
  isRecyclable: boolean;
  certifications: string[];
  typeSpecs: Record<string, any>;

  // Cost
  targetCostPerUnit: number;
  maxAcceptableCost: number;
  projectedAnnualUnits: number;

  // Feasibility dates
  feasibilityStartDate: string;
  targetApprovalDate: string;
  targetProductionDate: string;
  sampleRequestDate: string;
  sampleETA: string;
  sampleReceivedDate: string;
  samplesQty: number;
  feasibilityNotes: string;

  // Links
  linkedBriefIds: string[];
  linkedNPDIds: string[];

  // Nested collections
  vendors: ComponentVendor[];
  moqTiers: MOQTier[];
  productAssignments: ProductAssignment[];
  compatibilityTests: CompatibilityTest[];
  milestones: FeasibilityMilestone[];
  risks: ComponentRisk[];

  // Activity & files
  activityLog: string[];
  files: ComponentFile[];

  // Meta
  createdBy: string;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────

export const COMPONENT_TYPES: ComponentType[] = [
  'Primary Packaging',
  'Secondary Packaging',
  'Closures',
  'Labels & Decoration',
  'Raw Materials',
  'Accessories',
  'Regulatory Components',
];

export const COMPONENT_TYPE_COLORS: Record<ComponentType, string> = {
  'Primary Packaging': '#06B6D4',
  'Secondary Packaging': '#F59E0B',
  'Closures': '#8B5CF6',
  'Labels & Decoration': '#F43F5E',
  'Raw Materials': '#10B981',
  'Accessories': '#F97316',
  'Regulatory Components': '#7C3AED',
};

export const ALL_FEASIBILITY_STATUSES: FeasibilityStatus[] = [
  'Concept',
  'Feasibility Review',
  'Sampling',
  'Sample Testing',
  'Compatibility Testing',
  'Cost Negotiation',
  'Approved',
  'Conditionally Approved',
  'Active',
  'Discontinued',
  'On Hold',
  'Replaced',
];

export const FEASIBILITY_STATUS_COLORS: Record<FeasibilityStatus, string> = {
  'Concept': '#6B7280',
  'Feasibility Review': '#3B82F6',
  'Sampling': '#F59E0B',
  'Sample Testing': '#F97316',
  'Compatibility Testing': '#8B5CF6',
  'Cost Negotiation': '#06B6D4',
  'Approved': '#10B981',
  'Conditionally Approved': '#0D9488',
  'Active': '#65A30D',
  'Discontinued': '#EF4444',
  'On Hold': '#EAB308',
  'Replaced': '#475569',
};

export const COMPATIBILITY_BADGES: Record<
  CompatibilityResult,
  { label: string; color: string }
> = {
  pass: { label: 'Compatible', color: '#10B981' },
  fail: { label: 'Incompatible', color: '#EF4444' },
  conditional: { label: 'Conditional', color: '#F59E0B' },
  not_tested: { label: 'Not Tested', color: '#6B7280' },
  in_progress: { label: 'In Progress', color: '#3B82F6' },
};

export const SUB_TYPES: Record<ComponentType, string[]> = {
  'Primary Packaging': [
    'Tube',
    'Jar',
    'Bottle',
    'Pump',
    'Dropper',
    'Compact',
    'Stick',
    'Pouch',
    'Can',
    'Palette',
  ],
  'Secondary Packaging': [
    'Folding Carton',
    'Rigid Box',
    'Sleeve',
    'Shrink Wrap',
    'Display Box',
    'Mailer Box',
    'Tray',
    'Insert',
  ],
  'Closures': [
    'Screw Cap',
    'Flip Top',
    'Disc Top',
    'Press Cap',
    'Snap Cap',
    'Overcap',
    'Dropper Cap',
    'Pump Cap',
    'Mist Sprayer',
    'Tamper Evident',
  ],
  'Labels & Decoration': [
    'Pressure Sensitive Label',
    'Shrink Sleeve',
    'Hot Stamp',
    'Screen Print',
    'Pad Print',
    'Emboss/Deboss',
    'UV Print',
    'Digital Print',
    'Metallization',
    'Soft Touch Coating',
  ],
  'Raw Materials': [
    'Resin',
    'Glass',
    'Aluminum',
    'Paperboard',
    'Film',
    'Adhesive',
    'Ink',
    'Coating',
  ],
  'Accessories': [
    'Applicator',
    'Brush',
    'Sponge',
    'Mirror',
    'Spatula',
    'Bag',
    'Ribbon',
    'Tissue Paper',
    'Sticker',
    'Card Insert',
  ],
  'Regulatory Components': [
    'Safety Seal',
    'Tamper Band',
    'Child-Resistant Closure',
    'Desiccant',
    'RFID Tag',
    'QR/Barcode Label',
    'COA Document',
    'SDS Sheet',
  ],
};

export const TEST_TYPES: string[] = [
  'Compatibility Test',
  'Stability Test',
  'Fill/Seal Test',
  'Drop Test',
  'Torque Test',
  'Stress/Squeeze Test',
  'Pump Dispensing Test',
  'Migration Test',
  'Sensory Test',
  'Regulatory Check',
];

export const VENDOR_CERTIFICATIONS: string[] = [
  'ISO 9001',
  'ISO 22716',
  'FSC',
  'SMETA/Sedex',
  'BSCI',
  'Other',
];

export const DEFAULT_MILESTONES: Omit<FeasibilityMilestone, 'targetDate' | 'actualDate'>[] = [
  { milestoneName: 'Feasibility Kickoff', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Vendor Identified', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Sample Request Sent', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Samples Received', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Compatibility Testing Start', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Compatibility Testing Complete', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Cost Negotiation Complete', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
  { milestoneName: 'Final Approval', status: 'Not Started', completedBy: '', notes: '', isCustom: false },
];

export const EMPTY_COMPONENT_FORM: Component = {
  id: '',
  partNumber: '',
  name: '',
  type: 'Primary Packaging',
  subType: '',
  brands: [],
  description: '',
  status: 'Concept',
  priority: 'Medium',
  isReplacement: false,
  replacingComponentId: '',
  tags: [],

  material: '',
  color: '',
  finish: '',
  weightEmpty: '',
  countryOfManufacture: '',
  pcrContentPct: 0,
  isRecyclable: false,
  certifications: [],
  typeSpecs: {},

  targetCostPerUnit: 0,
  maxAcceptableCost: 0,
  projectedAnnualUnits: 0,

  feasibilityStartDate: '',
  targetApprovalDate: '',
  targetProductionDate: '',
  sampleRequestDate: '',
  sampleETA: '',
  sampleReceivedDate: '',
  samplesQty: 0,
  feasibilityNotes: '',

  linkedBriefIds: [],
  linkedNPDIds: [],

  vendors: [],
  moqTiers: [],
  productAssignments: [],
  compatibilityTests: [],
  milestones: DEFAULT_MILESTONES.map((m) => ({
    ...m,
    targetDate: '',
    actualDate: '',
  })),
  risks: [],

  activityLog: [],
  files: [],

  createdBy: '',
  createdAt: '',
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Generate a part number in the format COMP-{year}-{random 4 digits}.
 */
export function generatePartNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `COMP-${year}-${rand}`;
}

/**
 * Calculate the total landed cost for an MOQ tier.
 * landed = unitCost + shippingCostPerUnit + (unitCost * dutyRatePct / 100)
 */
export function calculateLandedCost(tier: MOQTier): number {
  return tier.unitCost + tier.shippingCostPerUnit + (tier.unitCost * tier.dutyRatePct) / 100;
}

/**
 * Return the worst-case compatibility result across all tests.
 * Priority: fail > conditional > in_progress > not_tested > pass
 */
export function getWorstCompatibility(tests: CompatibilityTest[]): CompatibilityResult {
  if (tests.length === 0) return 'not_tested';

  const priority: Record<CompatibilityResult, number> = {
    fail: 0,
    conditional: 1,
    in_progress: 2,
    not_tested: 3,
    pass: 4,
  };

  let worst: CompatibilityResult = 'pass';
  for (const t of tests) {
    if (priority[t.status] < priority[worst]) {
      worst = t.status;
    }
  }
  return worst;
}

/**
 * Return the lowest unit cost across all MOQ tiers.
 * Returns 0 if no tiers exist.
 */
export function getBestUnitCost(tiers: MOQTier[]): number {
  if (tiers.length === 0) return 0;
  return Math.min(...tiers.map((t) => t.unitCost));
}
