import { create } from 'zustand'

interface UserState {
  currentUser: {
    id: string
    name: string
    firstName: string
    email: string
    role: string
    orgId: string
    departmentId: string | null
    avatar: string | null
  } | null
  setCurrentUser: (user: UserState['currentUser']) => void
}

// The current user is populated from the authenticated session by AuthGate
// (GET /api/v1/auth/me). It is null until sign-in completes.
export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
}))
