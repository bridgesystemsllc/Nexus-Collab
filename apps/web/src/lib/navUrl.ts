/**
 * URL-based navigation state management.
 *
 * The URL is the source of truth for the current page, entity ids, and tab.
 * This module provides functions to parse, construct, and update the URL.
 */

// All valid Page values (must stay in sync with appStore.ts)
const PAGES = [
  'onboarding',
  'dashboard',
  'everything',
  'rd',
  'ops',
  'finance',
  'cowork',
  'cowork-detail',
  'docs',
  'product-catalog',
  'integrations',
  'email-agent',
  'dept-manager',
  'pulse',
  'people',
  'billing',
  'settings',
  'organization',
  'custom-dept',
  'projects',
  'tasks',
  'follow-ups',
  'agent-settings',
] as const

export type Page = (typeof PAGES)[number]

export interface NavState {
  page: Page
  coworkId: string | null
  deptId: string | null
  projectId: string | null
  tab: string | null
  /** Sub-view inside the current tab (e.g. Ops › Production › Open Orders). */
  sub?: string | null
}

function isPage(value: string): value is Page {
  return PAGES.includes(value as Page)
}

/**
 * Parse navigation state from URL search string.
 *
 * - `view` must be a valid Page, otherwise defaults to 'dashboard'
 * - If `view=cowork-detail` but no `cowork` param, falls back to 'cowork'
 * - If `view=custom-dept` but no `dept` param, falls back to 'dashboard'
 * - `tab` is kept for any page (page-scoped: setPage clears it on page change)
 * - `sub` is only kept when a `tab` is present
 */
export function parseNavUrl(search: string): NavState {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  const cowork = params.get('cowork')
  const dept = params.get('dept')
  const project = params.get('project')
  const tab = params.get('tab')
  const sub = params.get('sub')

  // Validate page
  let page: Page = 'dashboard'
  if (view && isPage(view)) {
    page = view
  }

  // Detail pages require their entity id
  if (page === 'cowork-detail' && !cowork) {
    page = 'cowork'
  }
  if (page === 'custom-dept' && !dept) {
    page = 'dashboard'
  }

  return {
    page,
    coworkId: cowork,
    deptId: dept,
    projectId: project,
    tab,
    sub: tab ? sub : null,
  }
}

// Navigation params we manage
const NAV_PARAMS = ['view', 'cowork', 'dept', 'project', 'tab', 'sub']

/**
 * Build a search string from NavState, preserving unknown params.
 *
 * - Sets or removes only `view/cowork/dept/project/tab/sub`
 * - Every other param (People filters, `ms`, `reason`) is kept in original order
 * - Null values delete the param
 */
export function navSearch(state: NavState, currentSearch: string): string {
  const current = new URLSearchParams(currentSearch)

  // Collect foreign params in their original order
  const foreign: Array<[string, string]> = []
  current.forEach((value, key) => {
    if (!NAV_PARAMS.includes(key)) {
      foreign.push([key, value])
    }
  })

  // Build new params
  const result = new URLSearchParams()

  // Add navigation params (only if non-null)
  if (state.page !== 'dashboard') {
    result.set('view', state.page)
  }
  if (state.coworkId) {
    result.set('cowork', state.coworkId)
  }
  if (state.deptId) {
    result.set('dept', state.deptId)
  }
  if (state.projectId) {
    result.set('project', state.projectId)
  }
  if (state.tab) {
    result.set('tab', state.tab)
    if (state.sub) {
      result.set('sub', state.sub)
    }
  }

  // Append foreign params in original order
  for (const [key, value] of foreign) {
    result.append(key, value)
  }

  const str = result.toString()
  return str ? `?${str}` : ''
}

/**
 * Update the URL to reflect the current navigation state.
 *
 * Uses `history.replaceState` only — never `pushState`, so we don't add
 * history entries. The URL is a reflection of state, not a navigation target.
 */
export function writeNavUrl(state: NavState): void {
  if (typeof window === 'undefined') return

  const newSearch = navSearch(state, window.location.search)
  const newUrl = window.location.pathname + newSearch + window.location.hash

  // Only update if different to avoid unnecessary history API calls
  if (newUrl !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, '', newUrl)
  }
}
