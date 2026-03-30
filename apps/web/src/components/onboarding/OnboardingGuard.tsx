import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { OnboardingWizard } from './OnboardingWizard'

interface Props {
  children: React.ReactNode
}

export function OnboardingGuard({ children }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.get('/onboarding/status').then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  })

  // Still loading — show nothing to prevent flash
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-[var(--border-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    )
  }

  // No org or onboarding not complete — show wizard
  if (!data?.onboardingComplete) {
    return <OnboardingWizard />
  }

  // Onboarding complete — render the app
  return <>{children}</>
}
