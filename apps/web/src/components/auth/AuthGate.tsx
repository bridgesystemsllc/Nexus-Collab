import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUserStore } from '@/stores/userStore'
import { LandingPage } from './LandingPage'

interface Props {
  children: React.ReactNode
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
export function AuthGate({ children }: Props) {
  const currentUser = useUserStore((s) => s.currentUser)
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (data && !currentUser) setCurrentUser(data)
  }, [data, currentUser, setCurrentUser])

  if (isLoading) return <Spinner />
  if (isError || !data) return <LandingPage />
  if (!currentUser) return <Spinner />

  return <>{children}</>
}
