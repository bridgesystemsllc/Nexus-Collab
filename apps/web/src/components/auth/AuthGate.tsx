import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { takePendingDraft, getDraftKey } from '@/lib/reauth'
import { purgeFormDrafts } from '@/lib/formDraftKey'
import { LandingPage } from './LandingPage'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { Toast, type ToastData } from '@/components/shared/Toast'

interface Props {
  children: React.ReactNode
}

interface AuthMeResponse {
  id?: string
  name?: string
  firstName?: string
  email?: string
  role?: string
  orgId?: string
  departmentId?: string | null
  avatar?: string | null
  status?: 'needs_onboarding'
}

function Spinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div className="w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--accent)' }} />
    </div>
  )
}

// Gates the entire app behind a real authenticated session. The acting user is
// loaded from the server (GET /auth/me) and stored in the user store so every
// downstream component knows who is really acting.
//
// Three states:
// 1. Member exists → render App (children)
// 2. Pending onboarding (status='needs_onboarding') → render OnboardingWizard full-page
// 3. Neither → render LandingPage (sign-in)
export function AuthGate({ children }: Props) {
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const openForm = useAppStore((s) => s.openForm)
  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const draftChecked = useRef(false)

  const { data, isLoading, isError, refetch } = useQuery<AuthMeResponse>({
    queryKey: ['auth-me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (data && data.id && !currentUser) {
      setCurrentUser({
        id: data.id,
        name: data.name!,
        firstName: data.firstName!,
        email: data.email!,
        role: data.role!,
        orgId: data.orgId!,
        departmentId: data.departmentId ?? null,
        avatar: data.avatar ?? null,
      })
    }
  }, [data, currentUser, setCurrentUser])

  // Restore pending draft after successful authentication
  useEffect(() => {
    if (!currentUser || draftChecked.current) return
    draftChecked.current = true

    // Check if there was a pending draft key before attempting to take it
    const hadPendingKey = !!sessionStorage.getItem('nexus.pendingDraft.v1')

    // No form survives a page load, so any per-form draft still in storage is
    // orphaned. Drop them before (possibly) placing the re-auth draft.
    purgeFormDrafts()

    const draft = takePendingDraft(currentUser.id)
    if (draft) {
      // Write the draft values to the form-specific draft key so useFormDraft can hydrate
      if (draft.values != null) {
        const formDraftKey = getDraftKey(
          draft.activeForm.formType,
          draft.activeForm.mode,
          draft.activeForm.recordId ?? null
        )
        try {
          sessionStorage.setItem(formDraftKey, JSON.stringify(draft.values))
        } catch {
          // Ignore storage errors
        }
      }

      // Reconstruct the activeForm object for openForm
      openForm({
        formType: draft.activeForm.formType,
        mode: draft.activeForm.mode,
        recordId: draft.activeForm.recordId,
        context: draft.activeForm.context ?? undefined,
      })
    } else if (hadPendingKey) {
      // There was a key but it failed validation (expired, wrong member, etc.)
      setToast({
        type: 'error',
        message: "We couldn't restore your unsaved changes (they expired or belong to another account).",
      })
    }
  }, [currentUser, openForm])

  // Handle onboarding completion — refetch auth state
  const handleOnboardingSuccess = () => {
    setOnboardingComplete(true)
    refetch()
  }

  if (isLoading) return <Spinner />
  if (isError || !data) return <LandingPage />

  // Pending onboarding — show wizard full-page (no Sidebar/TopBar/App)
  if (data.status === 'needs_onboarding' && !onboardingComplete) {
    return (
      <OnboardingWizard
        pendingUser={{ email: data.email!, name: data.name! }}
        onSuccess={handleOnboardingSuccess}
      />
    )
  }

  // Member exists — wait for store to be populated
  if (!currentUser && data.id) return <Spinner />

  return (
    <>
      {children}
      <Toast toast={toast} onDismiss={() => setToast(null)} duration={5000} />
    </>
  )
}
