import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUserStore } from '@/stores/userStore'
import { LandingPage } from './LandingPage'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

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
  const [onboardingComplete, setOnboardingComplete] = useState(false)

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

  return <>{children}</>
}
