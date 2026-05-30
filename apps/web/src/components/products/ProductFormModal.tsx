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
