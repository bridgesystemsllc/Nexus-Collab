# Product Catalog Module Design

## Problem

Products in Nexus are scattered as unstructured JSON across ModuleItem records (NPD, SKU Pipeline, Operations). There is no central product registry, no way to search/filter products, and no sync with the KarEve dashboard. When a product is referenced in any module, users type free text rather than selecting from a canonical list.

## Solution

Add a first-class `Product` model, a Product Catalog page under the Collaboration tab, KarEve sync integration, and a reusable `ProductSelect` dropdown component. This is Sub-project 1 — wiring `ProductSelect` into existing modules (NPD, Ops, Cowork, Everything) is Sub-project 2.

## Data Model

### New Prisma Model: `Product`

```prisma
model Product {
  id            String   @id @default(cuid())
  name          String
  brand         String
  category      String
  sku           String?  @unique
  upc           String?
  description   String?
  retailPrice   String?
  cogs          String?
  status        String   @default("ACTIVE") // ACTIVE, IN_DEVELOPMENT, DISCONTINUED
  imageUrl      String?
  weight        String?
  dimensions    String?
  ingredients   String?
  manufacturer  String?
  variants      Json?    // [{ name: string, sku: string, attributes: Record<string, string> }]
  kareveId      String?  @unique // Sync linkage to KarEve dashboard
  orgId         String
  org           Organization @relation(fields: [orgId], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Add `products Product[]` relation to the `Organization` model.

### Product Status Values

- `ACTIVE` — currently sold/available
- `IN_DEVELOPMENT` — being developed (linked from NPD)
- `DISCONTINUED` — no longer produced

## API Routes

All routes under `/api/v1/products`.

### `GET /products`

List all products for the organization. Supports query params:
- `search` — filters by name, SKU, or brand (case-insensitive contains)
- `brand` — filter by exact brand
- `status` — filter by status
- `category` — filter by category

Returns array of Product objects, sorted by `updatedAt` desc.

### `GET /products/:id`

Single product by ID.

### `POST /products`

Create a product. Request body validated with Zod:

```typescript
const createProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  sku: z.string().optional(),
  upc: z.string().optional(),
  description: z.string().optional(),
  retailPrice: z.string().optional(),
  cogs: z.string().optional(),
  status: z.string().default('ACTIVE'),
  imageUrl: z.string().optional(),
  weight: z.string().optional(),
  dimensions: z.string().optional(),
  ingredients: z.string().optional(),
  manufacturer: z.string().optional(),
  variants: z.any().optional(),
})
```

Returns 201 with created product. Returns 409 if SKU already exists.

### `PATCH /products/:id`

Update a product. Accepts partial body. Returns updated product.

### `DELETE /products/:id`

Delete a product. Returns 204.

### `POST /products/sync-kareve`

Sync products from KarEve dashboard:

1. Fetch the KarEve integration config from `Integration` table (type `ERP_KAREVE_SYNC`)
2. If not connected, return 400 with error
3. Decrypt API credentials
4. Call `${ERP_API_URL}/products` with API key header
5. For each product in response:
   - If a Product with matching `kareveId` exists, update it
   - If not, create it with `kareveId` set
6. Update `Integration.lastSyncAt` and increment `syncCount`
7. Create a `SyncLog` entry with `recordsProcessed` count
8. Return `{ created: number, updated: number, unchanged: number }`

KarEve API response mapping (assumed shape):

```typescript
// KarEve API returns:
interface KareveProduct {
  id: string          // → kareveId
  name: string        // → name
  brand: string       // → brand
  category: string    // → category
  sku: string         // → sku
  upc: string         // → upc
  description: string // → description
  price: string       // → retailPrice
  cost: string        // → cogs
  status: string      // → status (mapped: "active" → "ACTIVE", etc.)
  image_url: string   // → imageUrl
  weight: string      // → weight
  dimensions: string  // → dimensions
  ingredients: string // → ingredients
  manufacturer: string// → manufacturer
  variants: array     // → variants (JSON)
}
```

If the actual KarEve API shape differs, the mapping layer in the sync route is the only place that needs adjustment.

## Frontend

### Sidebar Navigation

Add "Product Catalog" to the collaboration section in `Sidebar.tsx`:

```typescript
const collaborationSection: NavSection = {
  label: 'COLLABORATION',
  items: [
    { id: 'cowork', label: 'Cowork Spaces', icon: Users },
    { id: 'docs', label: 'Documents', icon: FileText },
    { id: 'product-catalog', label: 'Product Catalog', icon: Package },
  ],
}
```

Add route mapping in `layout.tsx` for `product-catalog` page.

### Product Catalog Page

New file: `apps/web/src/app/routes/product-catalog.tsx`

**Layout sections (top to bottom):**

1. **Header bar** — Title "Product Catalog" + "+ New Product" button (top right)

2. **KarEve Sync banner** — Compact bar showing:
   - KarEve connection status indicator (green dot if connected)
   - "Last synced: [timestamp]" or "Never synced"
   - "Sync from KarEve" button
   - During sync: button shows "Syncing..." with disabled state
   - After sync: brief success message with counts ("12 created, 3 updated")

3. **Search & filters row:**
   - Search input (filters by name, SKU, brand)
   - Brand dropdown filter (populated from distinct brands in product list)
   - Status dropdown filter (All / Active / In Development / Discontinued)
   - Category dropdown filter

4. **Product table:**
   - Columns: Image (thumbnail or initial), Name, Brand, Category, SKU, Status
   - Rows are clickable — opens product detail slide-over
   - Empty state: "No products yet. Create one or sync from KarEve."

### Product Detail/Edit Slide-over

Same slide-over pattern as `NewNPDProjectModal` (slides in from right, backdrop, escape to close).

Used for both creating and editing products. Sections:

**Section 1: Basic Info**
- Name (required)
- Brand (required — dropdown from existing brands list: Carol's Daughter, Dermablend, Baxter of California, Ambi, AcneFree, plus any custom)
- Category (required — dropdown: Skincare, Haircare, Bodycare, OTC Drug, Color Cosmetics)
- SKU (optional)
- UPC (optional)
- Description (textarea, optional)
- Status (dropdown: Active, In Development, Discontinued)

**Section 2: Pricing**
- Retail Price (text input, optional)
- COGS (text input, optional)

**Section 3: Physical**
- Weight (text input, optional — e.g. "4 oz")
- Dimensions (text input, optional — e.g. "3x3x5 in")
- Image URL (text input, optional)

**Section 4: Formulation**
- Ingredients (textarea, optional)
- Manufacturer (text input, optional)

**Section 5: Variants**
- Dynamic list of variant rows
- Each row: Name, SKU, Attributes (key-value pairs)
- "+ Add Variant" button
- Remove button per row
- Stored as JSON array

**Footer:** Cancel + Save/Create button

### ProductSelect Component

Reusable dropdown following the `MemberSelect` pattern. Built as a shared component at `apps/web/src/components/shared/ProductSelect.tsx`.

**Props:**
```typescript
interface ProductSelectProps {
  value: { productId: string; productName: string }
  onChange: (val: { productId: string; productName: string }) => void
  products: Product[]
}
```

**Behavior:**
1. Clickable trigger showing selected product (thumbnail + name + SKU) or "Select product" placeholder
2. Dropdown with search input filtering by name, SKU, or brand
3. Scrollable product list showing: thumbnail/initial, name, SKU, brand
4. "Create New Product" button at bottom — inline quick form (name, brand, category, SKU only)
5. On create: calls `POST /products`, invalidates query cache, auto-selects
6. Clear button to deselect
7. Outside click to close

### Data Hooks

Add to `apps/web/src/hooks/useData.ts`:

```typescript
export function useProducts(params?: { search?: string; brand?: string; status?: string; category?: string }) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.get('/products', { params }).then(r => r.data),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/products', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/products/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useSyncKareve() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/products/sync-kareve').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}
```

## Styling

Follow existing Nexus design system:
- CSS variables: `var(--bg-surface)`, `var(--bg-elevated)`, `var(--bg-input)`, `var(--border-default)`, `var(--border-subtle)`, `var(--accent)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-tertiary)`, `var(--danger)`
- Rounded corners: `rounded-xl` for cards/containers, `rounded-lg` for inputs
- Text sizes: `text-[13px]` for labels, `text-[14px]` for values, `text-[11px]` for metadata
- Slide-over modal pattern from `NewNPDProjectModal`
- Table styling from ops.tsx SKU pipeline

## Error Handling

- `POST /products` returns 409 if SKU already exists — show inline error on SKU field
- `POST /products/sync-kareve` returns 400 if KarEve not connected — show "Connect KarEve in Integrations settings first" message with link
- Sync failures (network, API errors) — show error toast with message, log to SyncLog with ERROR status
- Form validation: Name, Brand, Category required — highlight fields on submit attempt

## Scope

**In scope (this spec):**
- `Product` Prisma model + migration
- Product CRUD API routes
- KarEve sync endpoint
- Product Catalog page (table, search, filters, KarEve sync banner)
- Product create/edit slide-over form
- `ProductSelect` reusable component
- Sidebar navigation entry
- Route mapping
- Data hooks

**Out of scope (Sub-project 2):**
- Wiring `ProductSelect` into NPD, Ops SKU Pipeline, Cowork Spaces, Everything view
- Product image upload (for now, image URL field only)
- Product analytics/reporting
- Batch product operations
- Product categories as a separate model (using string field for now)
