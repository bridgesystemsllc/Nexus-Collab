import { useState, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  Calendar,
  Package,
  Save,
} from 'lucide-react'
import { StatusFormCard } from '@/components/shared/StatusFormCard'
import { DocumentPanel } from '@/components/shared/DocumentPanel'
import { SendEmailButton } from '@/components/shared/SendEmailButton'
import { useUserStore } from '@/stores/userStore'
import type { ArtworkModuleItem, ArtworkTrackerData, DocFile, SharePointLink, ArtworkProduct } from './types'
import { ErpSyncedProductPicker, type SelectedProduct } from '@/components/shared/ErpSyncedProductPicker'
import { COUNTRY_OPTIONS } from '@/lib/countryOptions'

interface ArtworkDetailProps {
  item: ArtworkModuleItem
  departmentId: string
  moduleId: string
  onBack: () => void
  onUpdate: (patch: Partial<ArtworkTrackerData>) => Promise<void>
  onDelete: () => Promise<void>
  saving: boolean
  deleting: boolean
}

export function ArtworkDetail({
  item,
  departmentId,
  moduleId,
  onBack,
  onUpdate,
  onDelete,
  saving,
  deleting,
}: ArtworkDetailProps) {
  const data = item.data as ArtworkTrackerData
  const currentUser = useUserStore((s) => s.currentUser)

  const [localStatusForm, setLocalStatusForm] = useState(data.statusForm)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const initialProduct: SelectedProduct | null = data.product
    ? {
        productId: data.product.productId,
        sku: data.product.sku,
        name: data.product.name,
        brand: data.product.brand,
        kareveId: data.product.kareveId,
      }
    : null
  const [localProduct, setLocalProduct] = useState<SelectedProduct | null>(initialProduct)
  const [localVersion, setLocalVersion] = useState(data.version ?? '')
  const [localArtworkDate, setLocalArtworkDate] = useState(data.artworkDate ?? '')
  const [localBiLingual, setLocalBiLingual] = useState(data.biLingual ?? false)
  const [localCountries, setLocalCountries] = useState<string[]>(data.countries ?? [])
  const [productFieldsError, setProductFieldsError] = useState<string | null>(null)
  const [savingProductFields, setSavingProductFields] = useState(false)

  const files = useMemo(() => data.files ?? [], [data.files])
  const sharePointLinks = useMemo(() => data.sharePointLinks ?? [], [data.sharePointLinks])

  const handleStatusChange = useCallback(
    (patch: Partial<typeof localStatusForm>) => {
      setLocalStatusForm((prev) => ({ ...prev, ...patch }))
      setStatusError(null)
    },
    []
  )

  const handleStatusSave = useCallback(async () => {
    try {
      await onUpdate({
        statusForm: {
          ...localStatusForm,
          lastUpdated: new Date().toISOString(),
        },
      })
      setStatusError(null)
    } catch (err: any) {
      setStatusError(err?.message || 'Failed to save status')
    }
  }, [localStatusForm, onUpdate])

  const handleBiLingualChange = useCallback((checked: boolean) => {
    setLocalBiLingual(checked)
    if (!checked) {
      setLocalCountries([])
    }
  }, [])

  const toggleCountry = useCallback((country: string) => {
    setLocalCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    )
  }, [])

  const handleProductFieldsSave = useCallback(async () => {
    setProductFieldsError(null)

    if (localBiLingual && localCountries.length === 0) {
      setProductFieldsError('Select at least one country when Bi-Lingual is checked')
      return
    }

    const productData: ArtworkProduct | null = localProduct
      ? {
          productId: localProduct.productId,
          sku: localProduct.sku,
          name: localProduct.name,
          brand: localProduct.brand,
          kareveId: localProduct.kareveId,
        }
      : null

    try {
      setSavingProductFields(true)
      await onUpdate({
        product: productData,
        version: localVersion.trim().slice(0, 64),
        artworkDate: localArtworkDate || null,
        biLingual: localBiLingual,
        countries: localBiLingual ? localCountries : [],
      })
      setProductFieldsError(null)
    } catch (err: any) {
      setProductFieldsError(err?.message || 'Failed to save')
    } finally {
      setSavingProductFields(false)
    }
  }, [localProduct, localVersion, localArtworkDate, localBiLingual, localCountries, onUpdate])

  const handleUploadFiles = useCallback(
    async (uploadedFiles: File[]) => {
      const userName = currentUser?.name ?? 'Unknown'
      const newFiles: DocFile[] = uploadedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || 'file',
        uploadedBy: userName,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        url: URL.createObjectURL(f),
        source: 'local',
      }))

      await onUpdate({
        files: [...files, ...newFiles],
      })
    },
    [files, onUpdate, currentUser]
  )

  const handleRemoveFile = useCallback(
    async (index: number) => {
      const updated = files.filter((_, i) => i !== index)
      await onUpdate({ files: updated })
    },
    [files, onUpdate]
  )

  const handleAddSharePointLink = useCallback(
    async (link: { displayName: string; url: string }) => {
      const userName = currentUser?.name ?? 'Unknown'
      const newLink: SharePointLink = {
        ...link,
        addedBy: userName,
        addedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
      await onUpdate({
        sharePointLinks: [...sharePointLinks, newLink],
      })
    },
    [sharePointLinks, onUpdate, currentUser]
  )

  const handleRemoveSharePointLink = useCallback(
    async (index: number) => {
      const updated = sharePointLinks.filter((_, i) => i !== index)
      await onUpdate({ sharePointLinks: updated })
    },
    [sharePointLinks, onUpdate]
  )

  const handleDelete = useCallback(async () => {
    try {
      await onDelete()
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete')
    }
  }, [onDelete])

  const defaultEmailSubject = `Artwork Update: ${data.title}`
  const defaultEmailHtml = `<p>Hello,</p><p>Here's an update on the artwork: <strong>${data.title}</strong></p><p>Status: ${data.statusForm?.needsRevisions ? 'Needs revisions' : data.statusForm?.finalApprovalVersion ? `Final ${data.statusForm.finalApprovalVersion}` : 'In progress'}</p><p>${data.statusForm?.nextAction ? `Next action: ${data.statusForm.nextAction}` : ''}</p><p>Thanks!</p>`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-xs text-[var(--text-tertiary)]">Artwork</p>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {data.title || 'Untitled'}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-[var(--danger)] hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Confirm delete
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
          <AlertCircle size={14} className="text-[var(--danger)]" />
          <span className="text-[12px] text-[var(--danger)]">{deleteError}</span>
        </div>
      )}

      {/* Product & Metadata Fields */}
      <div className="data-cell space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Product & Details
          </h3>
          <button
            onClick={handleProductFieldsSave}
            disabled={savingProductFields || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all"
          >
            {savingProductFields ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save
          </button>
        </div>

        {productFieldsError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
            <AlertCircle size={14} className="text-[var(--danger)]" />
            <span className="text-[12px] text-[var(--danger)]">{productFieldsError}</span>
          </div>
        )}

        {/* Product */}
        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Product
          </label>
          <ErpSyncedProductPicker
            value={localProduct}
            onChange={setLocalProduct}
            disabled={savingProductFields || saving}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Version */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Version
            </label>
            <input
              type="text"
              value={localVersion}
              onChange={(e) => setLocalVersion(e.target.value)}
              placeholder="e.g., v1.0"
              maxLength={64}
              disabled={savingProductFields || saving}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] disabled:opacity-50"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={localArtworkDate}
                onChange={(e) => setLocalArtworkDate(e.target.value)}
                disabled={savingProductFields || saving}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] disabled:opacity-50"
              />
              <Calendar
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Bi-Lingual */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="edit-biLingual"
            checked={localBiLingual}
            onChange={(e) => handleBiLingualChange(e.target.checked)}
            disabled={savingProductFields || saving}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <label htmlFor="edit-biLingual" className="text-[14px] text-[var(--text-primary)] cursor-pointer">
            Bi-Lingual
          </label>
        </div>

        {/* Countries */}
        {localBiLingual && (
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Countries <span className="text-[var(--danger)]">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {COUNTRY_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCountry(c)}
                  disabled={savingProductFields || saving}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                    localCountries.includes(c)
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
                  } disabled:opacity-50`}
                >
                  {c}
                </button>
              ))}
            </div>
            {localBiLingual && localCountries.length === 0 && (
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">
                Select at least one country
              </p>
            )}
          </div>
        )}
      </div>

      {/* Intake Link */}
      <div className="data-cell">
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
          Intake
        </p>
        {data.intake?.kind === 'sharepoint' ? (
          <a
            href={data.intake.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[#0078D4] bg-[#0078D4]/8 hover:bg-[#0078D4]/15 transition-colors"
          >
            <ExternalLink size={14} />
            Open in SharePoint
          </a>
        ) : data.intake?.kind === 'upload' ? (
          <a
            href={data.intake.url}
            download={data.intake.filename}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--accent)] bg-[var(--accent-subtle)] hover:bg-[var(--accent)]/15 transition-colors"
          >
            <Download size={14} />
            Download {data.intake.filename}
          </a>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No intake file</p>
        )}
      </div>

      {/* Status Form */}
      <StatusFormCard
        lastUpdated={localStatusForm.lastUpdated}
        needsRevisions={localStatusForm.needsRevisions}
        needsRevisionsNotes={localStatusForm.needsRevisionsNotes}
        revisionsAssignees={localStatusForm.revisionsAssignees}
        approvalsAssignees={localStatusForm.approvalsAssignees}
        updatesAssignees={localStatusForm.updatesAssignees}
        nextAction={localStatusForm.nextAction}
        finalApprovalVersion={localStatusForm.finalApprovalVersion}
        onChange={handleStatusChange}
        onSave={handleStatusSave}
        saving={saving}
        error={statusError}
      />

      {/* Document Panel */}
      <div className="data-cell">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-3">
          Files & SharePoint Links
        </h3>
        <DocumentPanel
          files={files}
          sharepointLinks={sharePointLinks}
          onUploadFiles={handleUploadFiles}
          onRemoveFile={handleRemoveFile}
          onAddSharePointLink={handleAddSharePointLink}
          onRemoveSharePointLink={handleRemoveSharePointLink}
        />
      </div>

      {/* Send Email */}
      <div className="flex justify-end">
        <SendEmailButton
          itemId={item.id}
          defaultSubject={defaultEmailSubject}
          defaultHtml={defaultEmailHtml}
        />
      </div>
    </div>
  )
}
