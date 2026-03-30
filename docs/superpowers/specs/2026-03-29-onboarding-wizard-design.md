# Nexus Collab — Onboarding Wizard Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Approach:** Fullscreen takeover route (Zustand `currentPage: 'onboarding'`)

---

## Overview

An 8-step fullscreen onboarding wizard that runs once when the workspace creator first signs up. It collects all required information, creates/configures the workspace (Organization), seeds departments and integrations, sends team invites, and routes the user to the dashboard.

---

## Data Model Changes

### Extend `Organization` model

Add the following fields to the existing Prisma `Organization` model:

```prisma
usageContext       String?          // "work" | "personal" | "school" | "other"
color              String?          // hex color for workspace theme
referralSource     String?          // how they heard about Nexus
phoneNumber        String?          // workspace creator SMS alert number
featureInterests   String[]         // selected feature keys
onboardingComplete Boolean          @default(false)
```

Existing fields already cover: `name`, `slug`, `logoUrl`, `industry`.

### New model: `OrganizationInvite`

```prisma
model OrganizationInvite {
  id           String       @id @default(uuid())
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id])
  invitedEmail String
  role         String       @default("member")   // admin | member | viewer
  invitedBy    String
  inviter      Member       @relation(fields: [invitedBy], references: [id])
  token        String       @unique
  status       String       @default("pending")   // pending | accepted | expired
  expiresAt    DateTime
  createdAt    DateTime     @default(now())
}
```

### Existing `Integration` model — no schema change

For each integration the user selects during onboarding, insert a row with `connected: false`. The existing model already supports this pattern.

### No separate settings table

All settings fields live directly on `Organization` to avoid a 1:1 join on every dashboard load.

---

## Onboarding Flow — 8 Steps

### Step 1 — Usage Context (Required)
- **Heading:** "Where will you use Nexus Collab?"
- **Subheading:** "Help us personalize your workspace."
- **Input:** Single-select card grid (icon + label)
- **Options:** Work, Personal, School, Other
- **Field:** `usageContext`

### Step 2 — Industry Selection (Required)
- **Heading:** "What industry are you in?"
- **Subheading:** "We'll tailor your workspace features accordingly."
- **Input:** Searchable single-select dropdown (card grid style)
- **Options:** Contract Manufacturing, Beauty & Cosmetics, Hair Care, Fragrances & Perfumery, Retail, Technology, Healthcare, Education, Finance, Food & Beverage, Other (text input)
- **Field:** `industry`

### Step 3 — Department Management (Required, min 1)
- **Heading:** "What would you like to manage?"
- **Subheading:** "Select all departments that apply to your workspace."
- **Input:** Multi-select chip/tag grid
- **Options:** Sales, Operations, Marketing, Finance & Accounting, Human Resources, Product Development, Supply Chain / Procurement, Customer Service, IT / Technology, Legal & Compliance, Executive / Leadership
- **Field:** `departments` (array)

### Step 4 — Integrations (Optional)
- **Heading:** "Do you use any of these tools?"
- **Subheading:** "Connect your existing tools to Nexus Collab."
- **Input:** Multi-select card grid with tool logo + name
- **Options:** Microsoft Outlook, Microsoft Teams, Google Workspace, Slack, Zoom, Asana, Notion, HubSpot, Salesforce, QuickBooks, Shopify, None of the above
- **Field:** `integrations` (array)
- **Note:** Each marked as `connected: false` initially. OAuth connection happens post-onboarding in Settings.

### Step 5 — Feature Interests (Optional)
- **Heading:** "What features interest you most?"
- **Subheading:** "We'll prioritize these in your setup."
- **Input:** Multi-select card grid (icon + label + short description)
- **Options:**
  - Task & Project Management — "Assign tasks, track progress, set deadlines"
  - Team Messaging — "Real-time chat by channel or department"
  - Document Collaboration — "Shared docs, wikis, and file storage"
  - Meeting AI Bot — "Joins meetings, syncs notes to your calendar automatically"
  - Calendar & Scheduling — "Sync with Outlook or Google Calendar"
  - Analytics & Reporting — "Dashboards and performance insights"
  - Client Portal — "Share updates and files with external clients"
  - Automations & Workflows — "Automate repetitive tasks and approvals"
- **Field:** `featureInterests` (array)

### Step 6 — Workspace Setup (Required)
- **Heading:** "Set up your workspace"
- **Subheading:** "This is what your team will see."
- **Fields:**
  - Workspace Name (text, required) → `name`
  - Workspace Slug (auto-generated from name, editable, unique check on blur) → `slug`
  - Workspace Logo (optional image upload, circular crop preview) → `logoUrl`
  - Workspace Color (8 preset swatches + custom hex) → `color`
- **Slug behavior:** Auto-generate as user types (lowercase, spaces → hyphens, strip special chars). Live preview: `nexuscollab.app/[slug]`. Check uniqueness on blur via `GET /api/v1/onboarding/check-slug/:slug`.

### Step 7 — Invite Team (Optional)
- **Heading:** "Invite your team"
- **Subheading:** "Add teammates by email. They'll receive an invite link."
- **Input:** Dynamic email row list
  - Each row: email input + role dropdown (Admin, Member, Viewer)
  - "Add another" button
  - Remove (X) button per row (hidden when only one row)
  - Email validation on blur
- **Field:** `invites` (array of `{ email, role }`)
- **Additional field:** Phone number (optional) with format hint → `phoneNumber`

### Step 8 — Referral + Final Setup
- **Heading:** "Almost done!"
- **Subheading:** "A couple last things before we build your workspace."
- **Input:** Single-select dropdown — "How did you hear about Nexus Collab?"
- **Options:** Social Media (LinkedIn, Instagram, TikTok, X), Friend or Colleague, Google Search, YouTube, Podcast, Industry Event or Conference, Email / Newsletter, Other
- **Field:** `referralSource`
- **CTA:** "Create My Workspace" button with accent glow

---

## Backend API

### `POST /api/v1/onboarding`

**Request body:**
```typescript
{
  usageContext: string;           // required
  industry: string;               // required
  departments: string[];          // required, min 1
  integrations: string[];         // optional
  featureInterests: string[];     // optional
  workspaceName: string;          // required
  workspaceSlug: string;          // required, unique
  workspaceColor: string;         // optional
  workspaceLogo?: string;         // base64 or URL after upload
  invites: { email: string; role: string }[];  // optional
  phoneNumber?: string;           // optional
  referralSource?: string;        // optional
}
```

**Transaction steps (all-or-nothing via Prisma `$transaction`):**
1. Validate all fields with Zod
2. Check slug uniqueness against `Organization` table
3. Upload logo to S3/R2 if provided (before transaction)
4. Update `Organization` with all fields (name, slug, color, logoUrl, industry, usageContext, featureInterests, referralSource, phoneNumber)
5. Create `Department` records for each selected department
6. Create `Integration` rows with `connected: false` for each selected tool
7. Create `Member` record for the creator with role `ADMIN` (owner)
8. Create `OrganizationInvite` rows with unique tokens for each invite
9. Set `onboardingComplete = true`
10. Return org ID + redirect URL

**Post-transaction:** Queue invite emails via BullMQ (failure here does not roll back — invites exist in DB as `pending` and can be resent from Settings).

**Error handling:** If any transaction step fails, Prisma rolls back everything. Frontend receives structured error with failing field/step. User stays on Step 8 with a toast.

### `GET /api/v1/onboarding/check-slug/:slug`

Returns `{ available: boolean }`. Called on blur from Step 6 slug field.

---

## Frontend Architecture

### File structure (`apps/web/src/`)

```
components/onboarding/
├── OnboardingWizard.tsx          # Master container — step state, progress bar, navigation
├── OnboardingGuard.tsx           # Wraps layout — checks onboardingComplete, forces redirect
├── steps/
│   ├── StepUsageContext.tsx       # Step 1
│   ├── StepIndustry.tsx           # Step 2
│   ├── StepDepartments.tsx        # Step 3
│   ├── StepIntegrations.tsx       # Step 4
│   ├── StepFeatures.tsx           # Step 5
│   ├── StepWorkspace.tsx          # Step 6
│   ├── StepInviteTeam.tsx         # Step 7
│   └── StepReferral.tsx           # Step 8
└── shared/
    ├── SelectableCard.tsx         # Reusable card with selected/hover states
    ├── ChipSelect.tsx             # Multi-select chip/tag component
    ├── ProgressBar.tsx            # Top progress indicator
    └── StepLayout.tsx             # Consistent step wrapper (heading, subheading, content, nav)
```

### State management

- `OnboardingWizard` holds all form data in a single `useState<OnboardingData>` object
- Each step receives its slice of data + an `onUpdate` callback
- No data sent to backend until Step 8's "Create My Workspace" button
- One `POST /api/v1/onboarding` call handles entire submission

### Routing integration

- `OnboardingGuard` wraps the main `Layout` component
- On mount, checks if current user's org has `onboardingComplete === true`
- If not → sets `currentPage` to `'onboarding'` in Zustand store
- Dashboard and all other pages blocked until complete

---

## UI & Styling

### Layout
- Fullscreen centered card, max-width 640px, soft dark background (`--bg-base`)
- Desktop: vertical step indicator (numbered dots) on left side
- Mobile: horizontal progress bar at top
- Card uses `glass-card` pattern with `backdrop-filter: blur(20px)`

### Component interactions

**SelectableCard:**
- Idle: `bg-surface`, `border-subtle`, icon + label
- Hover: `bg-elevated`, `border-default`, `translateY(-1px)`
- Selected: `accent-subtle` background, `accent` border, checkmark top-right
- Single-select: deselects siblings on click
- Multi-select: toggles independently

**Step navigation:**
- Bottom bar: "Back" (left), "Continue" (right)
- "Continue" disabled until required fields filled
- Back hidden on Step 1
- "Skip for now" link on optional steps (4, 5, 7)

**Transitions:**
- Steps slide left/right with fade, 200ms, `--ease-spring` curve
- Progress bar animates width smoothly

**Step 6 specifics:**
- 8 preset color swatches (Indigo #7C3AED, Rose Gold #E8948A, Cyan #00C7FF, Violet #BF5AF2, Mint #30D158, Amber #FF9F0A, Blue #0A84FF, neutral #636366) + custom hex input
- Logo: circular crop preview, drag-and-drop or click-to-browse
- Slug: live preview `nexuscollab.app/[slug]`, inline checkmark/error on blur

**Step 7 specifics:**
- Dynamic rows: email + role dropdown (default "Member")
- "Add another" appends row, X removes (hidden when one row)
- Email validation on blur

**Step 8 loading sequence:**
- Button → fullscreen loading state
- Animated logo/spinner → "Building your workspace..." (2s) → "Setting up your departments..." (2s) → "Almost there..." (2s) → checkmark → "Welcome to Nexus Collab" → auto-redirect to dashboard (1.5s)
- On error: toast, return to Step 8 form

### Design system compliance
- Uses existing Tailwind config + CSS variables (Space Grotesk, accent #7C3AED for ERP context)
- Dark mode default, light mode supported
- All cards/buttons follow existing `glass-card`, `data-cell`, `btn-primary` patterns
- Motion uses existing `fadeUp`, `scaleIn`, `glowPulse` keyframes + `--ease-spring`

---

## Post-Onboarding Behavior

### Meeting AI Bot banner
If "Meeting AI Bot" selected in Step 5, show dismissible banner on dashboard after redirect:
- Text: "Set up your Meeting AI Bot — connect your calendar to start auto-joining meetings and syncing notes."
- Links to `/settings/meeting-bot`
- Dismiss writes to localStorage (`nexus-meeting-bot-banner-dismissed`)

### Integration stubs
Each selected integration appears in Settings > Integrations as a "Connect" button with `connected: false`.

### Onboarding guard
On every app load, check `onboardingComplete`. If `false`, redirect to onboarding. Block all dashboard access until complete.

---

## Validation Rules

| Field | Rule |
|-------|------|
| `usageContext` | Required, one of: work, personal, school, other |
| `industry` | Required, string |
| `departments` | Required, min 1 item |
| `integrations` | Optional, array of strings |
| `featureInterests` | Optional, array of strings |
| `workspaceName` | Required, 2-50 chars |
| `workspaceSlug` | Required, unique, lowercase, hyphens only, 2-50 chars |
| `workspaceColor` | Optional, valid hex |
| `invites[].email` | Valid email format |
| `invites[].role` | One of: admin, member, viewer |
| `phoneNumber` | Optional, valid phone format |
| `referralSource` | Optional, string |
