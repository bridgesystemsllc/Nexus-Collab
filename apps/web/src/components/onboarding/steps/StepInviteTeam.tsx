import { useState } from 'react'
import { Plus, X, Phone } from 'lucide-react'
import { StepLayout } from '../shared/StepLayout'

interface Invite {
  email: string
  role: string
}

interface Props {
  invites: Invite[]
  phoneNumber: string
  onChangeInvites: (invites: Invite[]) => void
  onChangePhone: (phone: string) => void
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function StepInviteTeam({
  invites,
  phoneNumber,
  onChangeInvites,
  onChangePhone,
  onBack,
  onContinue,
  onSkip,
}: Props) {
  const [emailErrors, setEmailErrors] = useState<Record<number, string>>({})

  const updateInvite = (index: number, field: keyof Invite, val: string) => {
    const updated = [...invites]
    updated[index] = { ...updated[index], [field]: val }
    onChangeInvites(updated)
  }

  const addRow = () => {
    onChangeInvites([...invites, { email: '', role: 'member' }])
  }

  const removeRow = (index: number) => {
    if (invites.length <= 1) return
    const updated = invites.filter((_, i) => i !== index)
    onChangeInvites(updated)
    const newErrors = { ...emailErrors }
    delete newErrors[index]
    setEmailErrors(newErrors)
  }

  const validateEmail = (index: number) => {
    const email = invites[index].email
    if (email && !isValidEmail(email)) {
      setEmailErrors((prev) => ({ ...prev, [index]: 'Invalid email address' }))
    } else {
      setEmailErrors((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
  }

  return (
    <StepLayout
      step={7}
      totalSteps={8}
      heading="Invite your team"
      subheading="Add teammates by email. They'll receive an invite link."
      canContinue={true}
      onBack={onBack}
      onContinue={onContinue}
      isOptional
      onSkip={onSkip}
    >
      <div className="flex flex-col gap-3 mb-6">
        {invites.map((invite, i) => (
          <div key={i} className="flex items-start gap-2">
            {/* Email */}
            <div className="flex-1">
              <input
                type="email"
                placeholder="colleague@company.com"
                value={invite.email}
                onChange={(e) => updateInvite(i, 'email', e.target.value)}
                onBlur={() => validateEmail(i)}
                className={`
                  w-full px-4 py-2.5 bg-[var(--bg-surface)] border rounded-[10px] text-[14px]
                  text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]
                  focus:outline-none transition-colors
                  ${emailErrors[i]
                    ? 'border-[var(--danger)] focus:border-[var(--danger)]'
                    : 'border-[var(--border-subtle)] focus:border-[var(--accent)]'
                  }
                `}
              />
              {emailErrors[i] && (
                <p className="mt-1 text-[11px] text-[var(--danger)]">{emailErrors[i]}</p>
              )}
            </div>

            {/* Role */}
            <select
              value={invite.role}
              onChange={(e) => updateInvite(i, 'role', e.target.value)}
              className="px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer min-w-[100px]"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>

            {/* Remove */}
            {invites.length > 1 && (
              <button
                onClick={() => removeRow(i)}
                className="mt-2 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}

        {/* Add another */}
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] hover:text-[var(--accent)] font-medium mt-1 self-start"
        >
          <Plus size={14} />
          Add another
        </button>
      </div>

      {/* Phone number */}
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.06em] mb-2">
          <Phone size={12} />
          Phone Number <span className="text-[var(--text-tertiary)] normal-case">(optional)</span>
        </label>
        <input
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phoneNumber}
          onChange={(e) => onChangePhone(e.target.value)}
          className="w-full px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[10px] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
          Receive workspace alerts and notifications via SMS.
        </p>
      </div>
    </StepLayout>
  )
}
