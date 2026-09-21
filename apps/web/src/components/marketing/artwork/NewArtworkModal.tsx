import { useState, useRef } from 'react'
import { X, Upload, ExternalLink, Loader2, AlertCircle, FileText, Calendar } from 'lucide-react'
import { OverlayPortal } from '@/components/shared/OverlayPortal'
import { useRequestUploadUrl } from '@/hooks/useData'
import { api } from '@/lib/api'
import type { ArtworkTrackerData, ArtworkIntake, ArtworkProduct } from './types'
import { getDefaultStatusForm } from './types'
import { ErpSyncedProductPicker, type SelectedProduct } from '@/components/shared/ErpSyncedProductPicker'
import { COUNTRY_OPTIONS } from '@/lib/countryOptions'

interface NewArtworkModalProps {
  open: boolean
  onClose: () => void
  departmentId: string
  moduleId: string
  onCreate: (data: ArtworkTrackerData) => Promise<void>
  creating: boolean
}

type IntakeMode = 'upload' | 'sharepoint'

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(47,128,237,0.12)]'

export function NewArtworkModal({
  open,
  onClose,
  departmentId,
  moduleId,
  onCreate,
  creating,
}: NewArtworkModalProps) {
  const [mode, setMode] = useState<IntakeMode>('upload')
  const [title, setTitle] = useState('')
  const [sharepointUrl, setSharepointUrl] = useState('')
  const [sharepointDisplayName, setSharepointDisplayName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null)
  const [version, setVersion] = useState('')
  const [artworkDate, setArtworkDate] = useState('')
  const [biLingual, setBiLingual] = useState(false)
  const [countries, setCountries] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const requestUploadUrl = useRequestUploadUrl()

  const resetForm = () => {
    setMode('upload')
    setTitle('')
    setSharepointUrl('')
    setSharepointDisplayName('')
    setSelectedFile(null)
    setUploading(false)
    setError(null)
    setUrlError(null)
    setSelectedProduct(null)
    setVersion('')
    setArtworkDate('')
    setBiLingual(false)
    setCountries([])
  }

  const handleClose = () => {
    if (!creating && !uploading) {
      resetForm()
      onClose()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const validateSharePointUrl = (url: string): boolean => {
    if (!url.includes('sharepoint.com')) {
      setUrlError('URL must contain sharepoint.com')
      return false
    }
    setUrlError(null)
    return true
  }

  const handleBiLingualChange = (checked: boolean) => {
    setBiLingual(checked)
    if (!checked) {
      setCountries([])
    }
  }

  const toggleCountry = (country: string) => {
    setCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    )
  }

  const handleCreate = async () => {
    setError(null)

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (biLingual && countries.length === 0) {
      setError('Select at least one country when Bi-Lingual is checked')
      return
    }

    let intake: ArtworkIntake

    if (mode === 'upload') {
      if (!selectedFile) {
        setError('Please select a file to upload')
        return
      }

      try {
        setUploading(true)

        const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
          name: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || 'application/octet-stream',
        })

        await fetch(uploadURL, {
          method: 'PUT',
          body: selectedFile,
          headers: {
            'Content-Type': selectedFile.type || 'application/octet-stream',
          },
        })

        intake = {
          kind: 'upload',
          filename: selectedFile.name,
          objectPath,
          url: `/api/v1/uploads${objectPath}`,
          mimeType: selectedFile.type,
          size: selectedFile.size,
        }
      } catch (err: any) {
        console.error('Upload error:', err)
        setError(err?.response?.data?.error || err?.message || 'Upload failed')
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    } else {
      if (!sharepointUrl.trim() || !sharepointDisplayName.trim()) {
        setError('Display name and SharePoint URL are required')
        return
      }

      if (!validateSharePointUrl(sharepointUrl)) {
        return
      }

      intake = {
        kind: 'sharepoint',
        url: sharepointUrl.trim(),
        displayName: sharepointDisplayName.trim(),
      }
    }

    const productData: ArtworkProduct | null = selectedProduct
      ? {
          productId: selectedProduct.productId,
          sku: selectedProduct.sku,
          name: selectedProduct.name,
          brand: selectedProduct.brand,
          kareveId: selectedProduct.kareveId,
        }
      : null

    const data: ArtworkTrackerData = {
      title: title.trim(),
      product: productData,
      version: version.trim().slice(0, 64),
      artworkDate: artworkDate || null,
      biLingual,
      countries: biLingual ? countries : [],
      intake,
      statusForm: getDefaultStatusForm(),
      sharePointLinks: [],
      files: [],
    }

    try {
      await onCreate(data)
      resetForm()
    } catch (err: any) {
      console.error('Create error:', err)
      setError(err?.response?.data?.error || err?.message || 'Failed to create artwork entry')
    }
  }

  if (!open) return null

  const canCreate =
    title.trim() &&
    (mode === 'upload' ? selectedFile !== null : (sharepointUrl.trim() && sharepointDisplayName.trim() && !urlError)) &&
    (!biLingual || countries.length > 0)

  const isSubmitting = creating || uploading

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">New Artwork</h2>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Mode Toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="intakeMode"
                  checked={mode === 'upload'}
                  onChange={() => setMode('upload')}
                  className="w-4 h-4 accent-[var(--accent)]"
                  disabled={isSubmitting}
                />
                <span className="text-[14px] text-[var(--text-primary)]">Upload file</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="intakeMode"
                  checked={mode === 'sharepoint'}
                  onChange={() => setMode('sharepoint')}
                  className="w-4 h-4 accent-[var(--accent)]"
                  disabled={isSubmitting}
                />
                <span className="text-[14px] text-[var(--text-primary)]">SharePoint URL</span>
              </label>
            </div>

            {/* Upload Mode */}
            {mode === 'upload' && (
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isSubmitting}
                />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent)] bg-[var(--bg-surface)] hover:bg-[var(--accent-subtle)] transition-all disabled:opacity-50"
                >
                  {selectedFile ? (
                    <>
                      <FileText size={20} className="text-[var(--accent)]" />
                      <span className="text-[14px] text-[var(--text-primary)] font-medium truncate max-w-[300px]">
                        {selectedFile.name}
                      </span>
                      <span className="text-[12px] text-[var(--text-tertiary)]">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={20} className="text-[var(--text-tertiary)]" />
                      <span className="text-[14px] text-[var(--text-secondary)]">
                        Choose a file to upload
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* SharePoint Mode */}
            {mode === 'sharepoint' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={sharepointDisplayName}
                    onChange={(e) => setSharepointDisplayName(e.target.value)}
                    placeholder="e.g., CD Scalp Oil Label v2"
                    className={inputClass}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                    SharePoint URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={sharepointUrl}
                      onChange={(e) => {
                        setSharepointUrl(e.target.value)
                        if (urlError) validateSharePointUrl(e.target.value)
                      }}
                      onBlur={() => sharepointUrl && validateSharePointUrl(sharepointUrl)}
                      placeholder="https://...sharepoint.com/..."
                      className={`${inputClass} ${urlError ? 'border-[var(--danger)] focus:border-[var(--danger)]' : ''}`}
                      disabled={isSubmitting}
                    />
                    <ExternalLink
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                    />
                  </div>
                  {urlError && (
                    <p className="text-[12px] text-[var(--danger)] mt-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {urlError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Product Picker */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Product
              </label>
              <ErpSyncedProductPicker
                value={selectedProduct}
                onChange={setSelectedProduct}
                disabled={isSubmitting}
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Title <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., CD Scalp Cleansing Oil label"
                className={inputClass}
                disabled={isSubmitting}
              />
            </div>

            {/* Version */}
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Version
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g., v1.0"
                maxLength={64}
                className={inputClass}
                disabled={isSubmitting}
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
                  value={artworkDate}
                  onChange={(e) => setArtworkDate(e.target.value)}
                  className={inputClass}
                  disabled={isSubmitting}
                />
                <Calendar
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                />
              </div>
            </div>

            {/* Bi-Lingual Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="biLingual"
                checked={biLingual}
                onChange={(e) => handleBiLingualChange(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
                disabled={isSubmitting}
              />
              <label htmlFor="biLingual" className="text-[14px] text-[var(--text-primary)] cursor-pointer">
                Bi-Lingual
              </label>
            </div>

            {/* Countries (conditional on Bi-Lingual) */}
            {biLingual && (
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
                      disabled={isSubmitting}
                      className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                        countries.includes(c)
                          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                          : 'bg-transparent text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--accent)]'
                      } disabled:opacity-50`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {biLingual && countries.length === 0 && (
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">
                    Select at least one country
                  </p>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
                <AlertCircle size={14} className="text-[var(--danger)] shrink-0" />
                <span className="text-[13px] text-[var(--danger)]">{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {uploading ? 'Uploading…' : 'Creating…'}
                </>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  )
}
