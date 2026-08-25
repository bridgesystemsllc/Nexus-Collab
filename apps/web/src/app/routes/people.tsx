import { UserDirectory } from '@/features/users/pages/UserDirectory'

// ─── People ──────────────────────────────────────────────────
// The directory owns its own header and profile drilldown, so the page is a
// thin mount point.

export function PeoplePage() {
  return <UserDirectory />
}
