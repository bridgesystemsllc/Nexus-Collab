import { useState, useEffect, useCallback } from 'react'
import { Check, X, Upload } from 'lucide-react'
import { StepLayout } from '../shared/StepLayout'
import { api } from '@/lib/api'

const PRESET_COLORS = [
  { name: 'Indigo', hex: '#7C3AED' },
  { name: 'Rose Gold', hex: '#E8948A' },
  { name: 'Cyan', hex: '#00C7FF' },
  { name: 'Violet', hex: '#BF5AF2' },
  { name: 'Mint', hex: '#30D158' },
  { name: 'Amber', hex: '#FF9F0A' },
  { name: 'Blue', hex: '#0A84FF' },
  { name: 'Neutral', hex: '#636366' },
]

interface WorkspaceData {
  workspaceName: string
  workspaceSlug: string
  workspaceColor: string
  workspaceLogoUrl: string
}

interface Props {
  value: WorkspaceData
  onChange: (value: WorkspaceData) => void
  onBack: () => void
  onContinue: () => void
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function StepWorkspace({ value, onChange, onBack, onContinue }: Props) {
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [showCustomColor, setShowCustomColor] = useState(false)
  const [customHex, setCustomHex] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const update = (partial: Partial<WorkspaceData>) => {
    onChange({ ...value, ...partial })
  }

  const handleNameChange = (name: string) => {
    const slug = generateSlug(name)
    update({ workspaceName: name, workspaceSlug: slug })
    setSlugStatus('idle')
  }

  const handleSlugChange = (slug: string) => {
    const cleaned = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
    update({ workspaceSlug: cleaned })
    setSlugStatus('idle')
  }

  const checkSlug = useCallback(async () => {
    if (!value.workspaceSlug || value.workspaceSlug.length < 2) return
    setSlugStatus('checking')
    try {
      const res = await api.get(`/onboarding/check-slug/${value.workspaceSlug}`)
      setSlugStatus(res.data.available ? 'available' : 'taken')
    } catch {
      setSlugStatus('idle')
    }
  }, [value.workspaceSlug])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoPreview(dataUrl)
      update({ workspaceLogoUrl: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  const canContinue =
    value.workspaceName.length >= 2 &&
    value.workspaceSlug.length >= 2 &&
    slugStatus !== 'taken'

  return (
    <StepLayout
      step={6}
      totalSteps={8}
      heading="Set up your workspace"
      subheading="This is what your team will see."
      canContinue={canContinue}
      onBack={onBack}
      onContinue={onContinue}
    >
      <div className="flex flex-col gap-6">
        {/* Workspace Name */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
            Workspace Name
          </label>
          <input
            type="text"
            placeholder="My Workspace"
            value={value.workspaceName}
            onChange={(e) => handleNameChange(e.target.value)}
            maxLength={50}
            className="w-full px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Workspace Slug */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
            Workspace URL
          </label>
          <div className="relative">
            <input
              type="text"
              value={value.workspaceSlug}
              onChange={(e) => handleSlugChange(e.target.value)}
              onBlur={checkSlug}
              maxLength={50}
              className="w-full px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors pr-10"
            />
            {/* Status indicator */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {slugStatus === 'checking' && (
                <div className="w-4 h-4 border-2 border-[var(--text-tertiary)]/30 border-t-[var(--text-tertiary)] rounded-full animate-spin" />
              )}
              {slugStatus === 'available' && (
                <Check size={16} className="text-[var(--success)]" />
              )}
              {slugStatus === 'taken' && (
                <X size={16} className="text-[var(--danger)]" />
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">
            nexuscollab.app/<span className="text-[var(--text-secondary)]">{value.workspaceSlug || 'your-workspace'}</span>
          </p>
          {slugStatus === 'taken' && (
            <p className="mt-1 text-[12px] text-[var(--danger)]">
              This URL is already taken. Try a different name.
            </p>
          )}
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
            Workspace Logo <span className="text-[var(--text-tertiary)] normal-case">(optional)</span>
          </label>
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="w-16 h-16 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[24px] font-bold text-[var(--text-tertiary)]">
                  {value.workspaceName?.[0]?.toUpperCase() || 'N'}
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] cursor-pointer transition-colors">
              <Upload size={14} />
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Color Picker */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
            Workspace Color
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => { update({ workspaceColor: c.hex }); setShowCustomColor(false) }}
                title={c.name}
                className={`
                  w-8 h-8 rounded-full border-2 transition-all duration-150 cursor-pointer
                  hover:scale-110
                  ${value.workspaceColor === c.hex
                    ? 'border-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.3)]'
                    : 'border-transparent'
                  }
                `}
                style={{ backgroundColor: c.hex }}
              />
            ))}

            {/* Custom color toggle */}
            <button
              onClick={() => setShowCustomColor(!showCustomColor)}
              className={`
                w-8 h-8 rounded-full border-2 transition-all duration-150 cursor-pointer
                bg-gradient-to-br from-red-500 via-green-500 to-blue-500
                hover:scale-110
                ${showCustomColor ? 'border-white scale-110' : 'border-transparent'}
              `}
              title="Custom color"
            />
          </div>

          {showCustomColor && (
            <div className="flex items-center gap-2 mt-3">
              <input
                type="color"
                value={customHex || value.workspaceColor || '#7C3AED'}
                onChange={(e) => { setCustomHex(e.target.value); update({ workspaceColor: e.target.value }) }}
                className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
              />
              <input
                type="text"
                placeholder="#7C3AED"
                value={customHex}
                onChange={(e) => {
                  const hex = e.target.value
                  setCustomHex(hex)
                  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                    update({ workspaceColor: hex })
                  }
                }}
                className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] w-28 font-mono"
              />
            </div>
          )}
        </div>
      </div>
    </StepLayout>
  )
}
