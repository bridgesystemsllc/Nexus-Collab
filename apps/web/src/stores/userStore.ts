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

// Placeholder user until Clerk auth is integrated
// This will be replaced with actual auth context
const PLACEHOLDER_USER = {
  id: 'user_ahmad',
  name: 'Ahmad G.',
  firstName: 'Ahmad',
  email: 'ahmad@kareve.com',
  role: 'ADMIN',
  orgId: '',
  departmentId: null,
  avatar: null,
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: PLACEHOLDER_USER,
  setCurrentUser: (user) => set({ currentUser: user }),
}))
