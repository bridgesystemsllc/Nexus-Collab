# Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Product Catalog module under the Collaboration tab with CRUD, KarEve sync, and a reusable ProductSelect component.

**Architecture:** New `Product` Prisma model with dedicated API routes (`/api/v1/products`). Product Catalog page added to sidebar under Collaboration. KarEve sync endpoint fetches from ERP API and upserts by `kareveId`. Reusable `ProductSelect` dropdown follows the `MemberSelect` pattern.

**Tech Stack:** React, TypeScript, Express, Prisma, PostgreSQL, TanStack React Query, Zod, Lucide icons, Nexus CSS design system.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/prisma/prisma/schema.prisma` | Modify | Add Product model |
| `apps/api/src/routes/products.ts` | Create | Product CRUD + KarEve sync endpoints |
| `apps/api/src/index.ts` | Modify | Register product routes |
| `apps/web/src/hooks/useData.ts` | Modify | Add product data hooks |
| `apps/web/src/stores/appStore.ts` | Modify | Add 'product-catalog' to Page type |
| `apps/web/src/components/layout/Sidebar.tsx` | Modify | Add Product Catalog nav item |
| `apps/web/src/app/layout.tsx` | Modify | Add ProductCatalogPage route case |
| `apps/web/src/app/routes/product-catalog.tsx` | Create | Product Catalog page (table, filters, sync banner) |
| `apps/web/src/components/products/ProductFormModal.tsx` | Create | Product create/edit slide-over form |
| `apps/web/src/components/shared/ProductSelect.tsx` | Create | Reusable product search/select dropdown |

---

### Task 1: Prisma schema — add Product model

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma`

- [ ] **Step 1: Add Product model to schema**

After the `Brand` model (line 135), add:

```prisma
// ─── Product ────────────────────────────────────────────────
model Product {
  id           String   @id @default(cuid())
  name         String
  brand        String
  category     String
  sku          String?  @unique
  upc          String?
  description  String?
  retailPrice  String?
  cogs         String?
  status       String   @default("ACTIVE") // ACTIVE, IN_DEVELOPMENT, DISCONTINUED
  imageUrl     String?
  weight       String?
  dimensions   String?
  ingredients  String?
  manufacturer String?
  variants     Json?
  kareveId     String?  @unique
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([orgId])
  @@index([status])
}
```

- [ ] **Step 2: Add products relation to Organization model**

In the `Organization` model (around line 11-32), add `products Product[]` after the `integrations` line:

```prisma
  integrations       Integration[]
  products           Product[]
  invites            OrganizationInvite[]
```

- [ ] **Step 3: Generate Prisma client and run migration**

Run:
```bash
cd /Users/ahmadgeorge/Nexus-Collab && npx prisma generate --schema packages/prisma/prisma/schema.prisma && npx prisma db push --schema packages/prisma/prisma/schema.prisma
```

If `db push` fails due to no DATABASE_URL, just run `npx prisma generate` — the migration can happen on deploy.

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/prisma/schema.prisma
git commit -m "feat: add Product model to Prisma schema"
```

---

### Task 2: Product API routes

**Files:**
- Create: `apps/api/src/routes/products.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create products route file**

Create `apps/api/src/routes/products.ts`:

```typescript
import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const prisma = new PrismaClient()
export const productRoutes = Router()

// ─── Validation ─────────────────────────────────────────────
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

// ─── List products ──────────────────────────────────────────
productRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const { search, brand, status, category } = req.query as Record<string, string>

    const where: any = { orgId: org.id }
    if (brand) where.brand = brand
    if (status) where.status = status
    if (category) where.category = category
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ]
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })
    res.json(products)
  } catch (error) {
    console.error('[products] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// ─── Get single product ─────────────────────────────────────
productRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id as string } })
    if (!product) return res.status(404).json({ error: 'Product not found' })
    res.json(product)
  } catch (error) {
    console.error('[products] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// ─── Create product ─────────────────────────────────────────
productRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createProductSchema.parse(req.body)
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const product = await prisma.product.create({
      data: { ...data, orgId: org.id },
    })
    res.status(201).json(product)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' })
    console.error('[products] POST / error:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// ─── Update product ─────────────────────────────────────────
productRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: req.body,
    })
    res.json(product)
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Product not found' })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' })
    console.error('[products] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// ─── Delete product ─────────────────────────────────────────
productRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id as string } })
    res.status(204).send()
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Product not found' })
    console.error('[products] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

// ─── Sync from KarEve ───────────────────────────────────────
productRoutes.post('/sync-kareve', async (req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const integration = await prisma.integration.findFirst({
      where: { type: 'ERP_KAREVE_SYNC', status: 'CONNECTED' },
    })
    if (!integration) {
      return res.status(400).json({ error: 'KarEve integration not connected. Configure it in Integrations settings.' })
    }

    // Decrypt config to get API credentials
    let config: { apiUrl: string; apiKey: string }
    try {
      const { decryptJson } = await import('../lib/encryption')
      config = decryptJson(integration.config as any)
    } catch {
      return res.status(500).json({ error: 'Failed to decrypt KarEve credentials' })
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: { integrationId: integration.id, status: 'RUNNING' },
    })

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'SYNCING' },
    })

    // Fetch products from KarEve API
    let kareveProducts: any[]
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${config.apiUrl}/products`, {
        headers: {
          'X-API-Key': config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`KarEve API returned ${response.status}`)
      }

      const data = await response.json()
      kareveProducts = Array.isArray(data) ? data : data.products || data.data || []
    } catch (fetchError: any) {
      // Mark sync as failed
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'ERROR', completedAt: new Date(), errors: { message: fetchError.message } },
      })
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: 'CONNECTED' },
      })
      return res.status(502).json({ error: `Failed to fetch from KarEve: ${fetchError.message}` })
    }

    // Upsert products
    let created = 0
    let updated = 0
    let unchanged = 0

    for (const kp of kareveProducts) {
      const productData = {
        name: kp.name || 'Unnamed Product',
        brand: kp.brand || '',
        category: kp.category || '',
        sku: kp.sku || null,
        upc: kp.upc || null,
        description: kp.description || null,
        retailPrice: kp.price || kp.retailPrice || null,
        cogs: kp.cost || kp.cogs || null,
        status: (kp.status || 'active').toUpperCase() === 'ACTIVE' ? 'ACTIVE'
          : (kp.status || '').toUpperCase() === 'DISCONTINUED' ? 'DISCONTINUED'
          : 'IN_DEVELOPMENT',
        imageUrl: kp.image_url || kp.imageUrl || null,
        weight: kp.weight || null,
        dimensions: kp.dimensions || null,
        ingredients: kp.ingredients || null,
        manufacturer: kp.manufacturer || null,
        variants: kp.variants || null,
        orgId: org.id,
      }

      const kareveId = String(kp.id)
      const existing = await prisma.product.findUnique({ where: { kareveId } })

      if (existing) {
        // Check if anything changed
        const changed = Object.entries(productData).some(
          ([key, val]) => key !== 'orgId' && (existing as any)[key] !== val
        )
        if (changed) {
          await prisma.product.update({ where: { kareveId }, data: productData })
          updated++
        } else {
          unchanged++
        }
      } else {
        await prisma.product.create({ data: { ...productData, kareveId } })
        created++
      }
    }

    // Complete sync
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        recordsProcessed: created + updated + unchanged,
      },
    })
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'CONNECTED', lastSyncAt: new Date(), syncCount: { increment: 1 } },
    })

    res.json({ created, updated, unchanged, total: kareveProducts.length })
  } catch (error) {
    console.error('[products] POST /sync-kareve error:', error)
    res.status(500).json({ error: 'Failed to sync from KarEve' })
  }
})
```

- [ ] **Step 2: Register routes in API index**

In `apps/api/src/index.ts`, add import at line 22 (after `emailAgentRoutes`):

```typescript
import { productRoutes } from './routes/products'
```

Add route registration at line 70 (after `emailAgentRoutes`):

```typescript
api.use('/products', productRoutes)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/products.ts apps/api/src/index.ts
git commit -m "feat: add Product CRUD and KarEve sync API routes"
```

---

### Task 3: Frontend data hooks

**Files:**
- Modify: `apps/web/src/hooks/useData.ts`

- [ ] **Step 1: Add product hooks**

At the end of the file (before the closing), add:

```typescript
// ─── Products ──────────────────────────────────────────────
export function useProducts(params?: Record<string, string>) {
  const searchParams = new URLSearchParams(params || {}).toString()
  return useQuery({
    queryKey: ['products', params],
    queryFn: () => api.get(`/products?${searchParams}`).then(r => r.data),
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
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/products/${id}`, data).then(r => r.data),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['integrations'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useData.ts
git commit -m "feat: add product data hooks (CRUD + KarEve sync)"
```

---

### Task 4: Register product-catalog page in app shell

**Files:**
- Modify: `apps/web/src/stores/appStore.ts`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Add 'product-catalog' to Page type**

In `apps/web/src/stores/appStore.ts`, add `'product-catalog'` to the Page union type (after `'agent-settings'`):

```typescript
type Page =
  | 'onboarding'
  | 'dashboard'
  | 'everything'
  | 'rd'
  | 'ops'
  | 'cowork'
  | 'cowork-detail'
  | 'docs'
  | 'integrations'
  | 'dept-manager'
  | 'pulse'
  | 'custom-dept'
  | 'agent-settings'
  | 'product-catalog'
```

- [ ] **Step 2: Add Product Catalog to sidebar**

In `apps/web/src/components/layout/Sidebar.tsx`:

Add `Package` to the lucide-react imports:

```typescript
import {
  LayoutDashboard,
  Database,
  FlaskConical,
  Settings2,
  Users,
  FileText,
  Plug,
  Bell,
  Boxes,
  Bot,
  ChevronLeft,
  ChevronRight,
  Package,
} from 'lucide-react'
```

Add the nav item to `collaborationSection`:

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

- [ ] **Step 3: Add route case in layout.tsx**

In `apps/web/src/app/layout.tsx`:

Add import:

```typescript
import { ProductCatalogPage } from '@/app/routes/product-catalog'
```

Add case in the switch statement (after `case 'agent-settings'`):

```typescript
    case 'product-catalog':
      return <ProductCatalogPage />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/appStore.ts apps/web/src/components/layout/Sidebar.tsx apps/web/src/app/layout.tsx
git commit -m "feat: register Product Catalog page in sidebar and routing"
```

---

### Task 5: Product form modal

**Files:**
- Create: `apps/web/src/components/products/ProductFormModal.tsx`

- [ ] **Step 1: Create ProductFormModal component**

Create `apps/web/src/components/products/ProductFormModal.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { X, Package, Plus, Trash2 } from 'lucide-react'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useData'

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const CATEGORIES = ['Skincare', 'Haircare', 'Bodycare', 'OTC Drug', 'Color Cosmetics']
const STATUSES = ['ACTIVE', 'IN_DEVELOPMENT', 'DISCONTINUED']

interface ProductFormData {
  name: string
  brand: string
  category: string
  sku: string
  upc: string
  description: string
  retailPrice: string
  cogs: string
  status: string
  imageUrl: string
  weight: string
  dimensions: string
  ingredients: string
  manufacturer: string
  variants: { name: string; sku: string; attributes: Record<string, string> }[]
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  brand: '',
  category: '',
  sku: '',
  upc: '',
  description: '',
  retailPrice: '',
  cogs: '',
  status: 'ACTIVE',
  imageUrl: '',
  weight: '',
  dimensions: '',
  ingredients: '',
  manufacturer: '',
  variants: [],
}

interface Props {
  open: boolean
  onClose: () => void
  product?: any // existing product for edit mode
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[12px] text-[var(--danger)] mt-1">{error}</p>}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all ${
        error
          ? 'border-[var(--danger)] focus:border-[var(--danger)]'
          : 'border-[var(--border-default)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
      }`}
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all resize-y focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]"
    />
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  error?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none transition-all ${
        error
          ? 'border-[var(--danger)]'
          : 'border-[var(--border-default)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
      }`}
    >
      <option value="">{placeholder || 'Select...'}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

export function ProductFormModal({ open, onClose, product }: Props) {
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const isEdit = !!product

  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          name: product.name || '',
          brand: product.brand || '',
          category: product.category || '',
          sku: product.sku || '',
          upc: product.upc || '',
          description: product.description || '',
          retailPrice: product.retailPrice || '',
          cogs: product.cogs || '',
          status: product.status || 'ACTIVE',
          imageUrl: product.imageUrl || '',
          weight: product.weight || '',
          dimensions: product.dimensions || '',
          ingredients: product.ingredients || '',
          manufacturer: product.manufacturer || '',
          variants: product.variants || [],
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
      setApiError('')
    }
  }, [open, product])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Product name is required'
    if (!form.brand) errs.brand = 'Brand is required'
    if (!form.category) errs.category = 'Category is required'
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setApiError('')

    try {
      const payload: any = { ...form }
      // Clean empty strings to null for optional fields
      for (const key of ['sku', 'upc', 'description', 'retailPrice', 'cogs', 'imageUrl', 'weight', 'dimensions', 'ingredients', 'manufacturer']) {
        if (!payload[key]) payload[key] = undefined
      }
      if (payload.variants.length === 0) payload.variants = undefined

      if (isEdit) {
        await updateProduct.mutateAsync({ id: product.id, ...payload })
      } else {
        await createProduct.mutateAsync(payload)
      }
      onClose()
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setApiError('A product with this SKU already exists')
      } else {
        setApiError('Failed to save product')
      }
    }
  }

  const addVariant = () => {
    setForm({ ...form, variants: [...form.variants, { name: '', sku: '', attributes: {} }] })
  }

  const updateVariant = (index: number, field: string, value: string) => {
    const variants = [...form.variants]
    variants[index] = { ...variants[index], [field]: value }
    setForm({ ...form, variants })
  }

  const removeVariant = (index: number) => {
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) })
  }

  const isPending = createProduct.isPending || updateProduct.isPending

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col min-h-0 bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[720px] h-screen animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <Package size={18} className="text-white" />
            </div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              {isEdit ? 'Edit Product' : 'New Product'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {apiError && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700">
              {apiError}
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Basic Information</h3>
            <div className="space-y-4">
              <Field label="Product Name" required error={errors.name}>
                <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder='e.g. "Ambi Fade Cream"' error={!!errors.name} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Brand" required error={errors.brand}>
                  <Select value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} options={BRANDS} placeholder="Select brand" error={!!errors.brand} />
                </Field>
                <Field label="Category" required error={errors.category}>
                  <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} placeholder="Select category" error={!!errors.category} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="SKU">
                  <Input value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} placeholder="e.g. AMB-FC-001" />
                </Field>
                <Field label="UPC">
                  <Input value={form.upc} onChange={(v) => setForm({ ...form, upc: v })} placeholder="e.g. 012345678901" />
                </Field>
              </div>

              <Field label="Status">
                <Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={STATUSES} />
              </Field>

              <Field label="Description">
                <TextArea value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Product description" />
              </Field>
            </div>
          </div>

          {/* Section 2: Pricing */}
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Pricing</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Retail Price">
                <Input value={form.retailPrice} onChange={(v) => setForm({ ...form, retailPrice: v })} placeholder="e.g. $8.99" />
              </Field>
              <Field label="COGS">
                <Input value={form.cogs} onChange={(v) => setForm({ ...form, cogs: v })} placeholder="e.g. $2.35" />
              </Field>
            </div>
          </div>

          {/* Section 3: Physical */}
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Physical Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Weight">
                  <Input value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} placeholder="e.g. 4 oz" />
                </Field>
                <Field label="Dimensions">
                  <Input value={form.dimensions} onChange={(v) => setForm({ ...form, dimensions: v })} placeholder="e.g. 3x3x5 in" />
                </Field>
              </div>
              <Field label="Image URL">
                <Input value={form.imageUrl} onChange={(v) => setForm({ ...form, imageUrl: v })} placeholder="https://..." />
              </Field>
            </div>
          </div>

          {/* Section 4: Formulation */}
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">Formulation</h3>
            <div className="space-y-4">
              <Field label="Ingredients">
                <TextArea value={form.ingredients} onChange={(v) => setForm({ ...form, ingredients: v })} placeholder="Active and inactive ingredients" rows={4} />
              </Field>
              <Field label="Manufacturer">
                <Input value={form.manufacturer} onChange={(v) => setForm({ ...form, manufacturer: v })} placeholder="e.g. ABC Manufacturing Co." />
              </Field>
            </div>
          </div>

          {/* Section 5: Variants */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Variants</h3>
              <button
                type="button"
                onClick={addVariant}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Plus size={14} /> Add Variant
              </button>
            </div>

            {form.variants.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)]">No variants added.</p>
            ) : (
              <div className="space-y-3">
                {form.variants.map((variant, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <Input value={variant.name} onChange={(v) => updateVariant(i, 'name', v)} placeholder="Variant name" />
                      <Input value={variant.sku} onChange={(v) => updateVariant(i, 'sku', v)} placeholder="Variant SKU" />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors mt-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-5 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/products/ProductFormModal.tsx
git commit -m "feat: add ProductFormModal slide-over for create/edit"
```

---

### Task 6: Product Catalog page

**Files:**
- Create: `apps/web/src/app/routes/product-catalog.tsx`

- [ ] **Step 1: Create ProductCatalogPage**

Create `apps/web/src/app/routes/product-catalog.tsx`:

```typescript
import { useState } from 'react'
import { Package, Plus, Search, RefreshCw, ExternalLink } from 'lucide-react'
import { useProducts, useSyncKareve, useDeleteProduct } from '@/hooks/useData'
import { useIntegrations } from '@/hooks/useData'
import { ProductFormModal } from '@/components/products/ProductFormModal'

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  IN_DEVELOPMENT: 'bg-amber-100 text-amber-700',
  DISCONTINUED: 'bg-gray-100 text-gray-500',
}

export function ProductCatalogPage() {
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<any>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const params: Record<string, string> = {}
  if (search) params.search = search
  if (brandFilter) params.brand = brandFilter
  if (statusFilter) params.status = statusFilter
  if (categoryFilter) params.category = categoryFilter

  const { data: products = [], isLoading } = useProducts(params)
  const { data: integrations = [] } = useIntegrations()
  const syncKareve = useSyncKareve()
  const deleteProduct = useDeleteProduct()

  const kareveIntegration = integrations.find((i: any) => i.type === 'ERP_KAREVE_SYNC')
  const isKareveConnected = kareveIntegration?.status === 'CONNECTED'
  const lastSyncAt = kareveIntegration?.lastSyncAt

  // Get unique brands and categories from products for filters
  const allBrands = [...new Set(products.map((p: any) => p.brand).filter(Boolean))].sort()
  const allCategories = [...new Set(products.map((p: any) => p.category).filter(Boolean))].sort()

  const handleSync = async () => {
    setSyncResult(null)
    try {
      const result = await syncKareve.mutateAsync()
      setSyncResult(`Synced: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged`)
      setTimeout(() => setSyncResult(null), 5000)
    } catch (err: any) {
      setSyncResult(err?.response?.data?.error || 'Sync failed')
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  const handleEdit = (product: any) => {
    setEditProduct(product)
    setFormOpen(true)
  }

  const handleNew = () => {
    setEditProduct(null)
    setFormOpen(true)
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    setEditProduct(null)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-[var(--text-primary)]">Product Catalog</h1>
              <p className="text-[13px] text-[var(--text-tertiary)]">
                {products.length} product{products.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-all"
          >
            <Plus size={16} /> New Product
          </button>
        </div>

        {/* KarEve Sync Banner */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isKareveConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <span className="text-[13px] text-[var(--text-secondary)]">
              KarEve Dashboard
            </span>
            {lastSyncAt && (
              <span className="text-[12px] text-[var(--text-tertiary)]">
                Last synced: {new Date(lastSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {!lastSyncAt && isKareveConnected && (
              <span className="text-[12px] text-[var(--text-tertiary)]">Never synced</span>
            )}
            {syncResult && (
              <span className={`text-[12px] font-medium ${syncResult.startsWith('Synced') ? 'text-emerald-600' : 'text-[var(--danger)]'}`}>
                {syncResult}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isKareveConnected && (
              <span className="text-[12px] text-[var(--text-tertiary)]">Not connected</span>
            )}
            <button
              onClick={handleSync}
              disabled={!isKareveConnected || syncKareve.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={syncKareve.isPending ? 'animate-spin' : ''} />
              {syncKareve.isPending ? 'Syncing...' : 'Sync from KarEve'}
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, or brand..."
              className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Brands</option>
            {allBrands.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Categories</option>
            {allCategories.map((c: string) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_DEVELOPMENT">In Development</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>
        </div>

        {/* Product Table */}
        <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[48px_1fr_140px_140px_120px_100px] gap-4 px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
            <span />
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Product</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Brand</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Category</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">SKU</span>
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Status</span>
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[var(--text-tertiary)]">No products yet.</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Create one or sync from KarEve.</p>
            </div>
          ) : (
            products.map((product: any, i: number) => (
              <button
                key={product.id}
                onClick={() => handleEdit(product)}
                className={`w-full grid grid-cols-[48px_1fr_140px_140px_120px_100px] gap-4 px-4 py-3 items-center text-left hover:bg-[var(--bg-hover)] transition-colors ${
                  i < products.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                }`}
              >
                {/* Image / Initial */}
                <div className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[14px] font-semibold text-[var(--text-tertiary)]">
                      {product.name?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{product.name}</p>
                  {product.upc && (
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">UPC: {product.upc}</p>
                  )}
                </div>

                {/* Brand */}
                <span className="text-[13px] text-[var(--text-secondary)] truncate">{product.brand}</span>

                {/* Category */}
                <span className="text-[13px] text-[var(--text-secondary)] truncate">{product.category}</span>

                {/* SKU */}
                <span className="text-[13px] text-[var(--text-secondary)] font-mono truncate">{product.sku || '--'}</span>

                {/* Status */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[product.status] || 'bg-gray-100 text-gray-500'}`}>
                  {product.status === 'IN_DEVELOPMENT' ? 'In Dev' : product.status === 'DISCONTINUED' ? 'Disc.' : 'Active'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Product Form Modal */}
      <ProductFormModal open={formOpen} onClose={handleCloseForm} product={editProduct} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/routes/product-catalog.tsx
git commit -m "feat: add Product Catalog page with table, filters, and KarEve sync"
```

---

### Task 7: ProductSelect reusable component

**Files:**
- Create: `apps/web/src/components/shared/ProductSelect.tsx`

- [ ] **Step 1: Create ProductSelect component**

Create `apps/web/src/components/shared/ProductSelect.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronDown, Plus, Package } from 'lucide-react'
import { useCreateProduct } from '@/hooks/useData'

interface Product {
  id: string
  name: string
  brand: string
  sku?: string
  imageUrl?: string
}

interface ProductSelectProps {
  value: { productId: string; productName: string }
  onChange: (val: { productId: string; productName: string }) => void
  products: Product[]
}

const BRANDS = ["Carol's Daughter", 'Dermablend', 'Baxter of California', 'Ambi', 'AcneFree']
const CATEGORIES = ['Skincare', 'Haircare', 'Bodycare', 'OTC Drug', 'Color Cosmetics']

export function ProductSelect({ value, onChange, products }: ProductSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newSku, setNewSku] = useState('')
  const [createError, setCreateError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const createProduct = useCreateProduct()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.brand ?? '').toLowerCase().includes(q)
    )
  })

  const handleSelect = (p: Product) => {
    onChange({ productId: p.id, productName: p.name })
    setOpen(false)
    setSearch('')
    setCreating(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ productId: '', productName: '' })
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newBrand || !newCategory) return
    setCreateError('')
    try {
      const created = await createProduct.mutateAsync({
        name: newName.trim(),
        brand: newBrand,
        category: newCategory,
        sku: newSku.trim() || undefined,
      })
      onChange({ productId: created.id, productName: created.name })
      setOpen(false)
      setCreating(false)
      setNewName('')
      setNewBrand('')
      setNewCategory('')
      setNewSku('')
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setCreateError('SKU already exists')
      } else {
        setCreateError('Failed to create product')
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between bg-[var(--bg-input)] border rounded-lg px-3.5 py-2.5 text-[14px] text-left transition-all ${
          open
            ? 'border-[var(--accent)] shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'
            : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {value.productName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Package size={12} className="text-[var(--text-tertiary)]" />
            </div>
            <span className="text-[var(--text-primary)] truncate">{value.productName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--text-tertiary)]">Select product</span>
        )}
        <ChevronDown size={16} className="text-[var(--text-tertiary)] shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          {!creating ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
                <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>

              <div className="max-h-[200px] overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">No products found</p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <div className="w-7 h-7 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 overflow-hidden">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-semibold text-[var(--text-tertiary)]">
                            {p.name?.[0]?.toUpperCase() ?? '?'}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{p.name}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                          {p.brand}{p.sku ? ` · ${p.sku}` : ''}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => { setCreating(true); setSearch('') }}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border-subtle)] text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Plus size={14} />
                Create New Product
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2.5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">New Product</p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Product name"
                autoFocus
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              <select
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select brand</option>
                {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="SKU (optional)"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
              />
              {createError && (
                <p className="text-[12px] text-[var(--danger)]">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setNewBrand(''); setNewCategory(''); setNewSku(''); setCreateError('') }}
                  className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newBrand || !newCategory || createProduct.isPending}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createProduct.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/shared/ProductSelect.tsx
git commit -m "feat: add reusable ProductSelect dropdown component"
```
