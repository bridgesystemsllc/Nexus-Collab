import { useAppStore } from '@/stores/appStore'

/**
 * Page tab state backed by the app store, so it round-trips through the URL
 * (`?tab=`) and survives a hard refresh. Tabs are page-scoped: `setPage`
 * clears them on page change. Unknown values fall back to `fallback`.
 */
export function useUrlTab<T extends string>(valid: readonly T[], fallback: T): [T, (tab: T) => void] {
  const currentTab = useAppStore((s) => s.currentTab)
  const setTab = useAppStore((s) => s.setTab)
  const tab = currentTab && valid.includes(currentTab as T) ? (currentTab as T) : fallback
  return [tab, setTab]
}

/**
 * Sub-view inside the current tab (`?sub=`), e.g. Ops › Production › Open
 * Orders. Cleared whenever the tab changes.
 */
export function useUrlSub<T extends string>(valid: readonly T[], fallback: T): [T, (sub: T) => void] {
  const currentSub = useAppStore((s) => s.currentSub)
  const setSub = useAppStore((s) => s.setSub)
  const sub = currentSub && valid.includes(currentSub as T) ? (currentSub as T) : fallback
  return [sub, setSub]
}
