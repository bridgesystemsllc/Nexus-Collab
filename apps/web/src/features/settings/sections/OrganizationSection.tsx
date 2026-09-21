import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert, SectionSkeleton } from '../components/SettingsPrimitives'
import type { IndustryKey } from '@nexus/shared'
import { INDUSTRY_OPTIONS } from '@nexus/shared'

interface Organization {
  id: string
  name: string
  slug: string
  industry: IndustryKey | null
  logoUrl: string | null
  phoneNumber: string | null
  onboardingComplete: boolean
  createdAt: string
}

export function OrganizationSection() {
  const queryClient = useQueryClient()

  const { data: org, isLoading, isError } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const res = await api.get('/organization')
      return res.data as Organization
    },
  })

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<IndustryKey | ''>('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [dirty, setDirty] = useState(false)

  // Initialize form when data loads
  useState(() => {
    if (org) {
      setName(org.name)
      setIndustry(org.industry ?? '')
      setPhoneNumber(org.phoneNumber ?? '')
    }
  })

  // Update form when org changes
  if (org && !dirty && name !== org.name) {
    setName(org.name)
    setIndustry(org.industry ?? '')
    setPhoneNumber(org.phoneNumber ?? '')
  }

  const update = useMutation({
    mutationFn: async () => {
      const res = await api.patch('/organization', {
        name: name.trim() || undefined,
        industry: industry || undefined,
        phoneNumber: phoneNumber.trim() || null,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] })
      setDirty(false)
    },
  })

  if (isLoading) return <SectionSkeleton />
  if (isError || !org) return <Alert>Could not load organization settings.</Alert>

  const handleChange = (setter: (v: any) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value)
    setDirty(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Organization
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Manage your workspace settings
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Business name
          </label>
          <input
            type="text"
            value={name}
            onChange={handleChange(setName)}
            className="w-full max-w-md px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Industry
          </label>
          <select
            value={industry}
            onChange={handleChange(setIndustry)}
            className="w-full max-w-md px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Select industry</option>
            {INDUSTRY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Phone number
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={handleChange(setPhoneNumber)}
            placeholder="+1 (555) 123-4567"
            className="w-full max-w-md px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="pt-2">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Workspace slug: <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)' }}>{org.slug}</code>
          </p>
        </div>
      </div>

      {update.isError && (
        <Alert>
          {(update.error as any)?.response?.data?.error?.message ?? 'Failed to save changes'}
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => {
            setName(org.name)
            setIndustry(org.industry ?? '')
            setPhoneNumber(org.phoneNumber ?? '')
            setDirty(false)
          }}
          disabled={!dirty || update.isPending}
          className="px-4 py-2 rounded-lg text-sm"
          style={{
            color: 'var(--text-secondary)',
            opacity: dirty ? 1 : 0.5,
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => update.mutate()}
          disabled={!dirty || update.isPending}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {update.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
