import { describe, it, expect } from 'vitest'
import { parseNavUrl, navSearch, type NavState } from './navUrl'

describe('parseNavUrl', () => {
  it('returns dashboard for empty search', () => {
    expect(parseNavUrl('')).toEqual({
      page: 'dashboard',
      coworkId: null,
      deptId: null,
      projectId: null,
      tab: null,
    })
  })

  it('parses valid view param', () => {
    expect(parseNavUrl('?view=tasks').page).toBe('tasks')
    expect(parseNavUrl('?view=ops').page).toBe('ops')
    expect(parseNavUrl('?view=people').page).toBe('people')
    expect(parseNavUrl('?view=cowork').page).toBe('cowork')
  })

  it('returns dashboard for invalid view', () => {
    expect(parseNavUrl('?view=nope').page).toBe('dashboard')
    expect(parseNavUrl('?view=').page).toBe('dashboard')
    expect(parseNavUrl('?view=TASKS').page).toBe('dashboard') // case sensitive
  })

  // I3: a detail page is never restored without its id
  it('falls back cowork-detail to cowork when no cowork param', () => {
    expect(parseNavUrl('?view=cowork-detail').page).toBe('cowork')
  })

  it('keeps cowork-detail when cowork param present', () => {
    const result = parseNavUrl('?view=cowork-detail&cowork=c1')
    expect(result.page).toBe('cowork-detail')
    expect(result.coworkId).toBe('c1')
  })

  it('falls back custom-dept to dashboard when no dept param', () => {
    expect(parseNavUrl('?view=custom-dept').page).toBe('dashboard')
  })

  it('keeps custom-dept when dept param present', () => {
    const result = parseNavUrl('?view=custom-dept&dept=d1')
    expect(result.page).toBe('custom-dept')
    expect(result.deptId).toBe('d1')
  })

  it('parses tab only for ops view', () => {
    expect(parseNavUrl('?view=ops&tab=production').tab).toBe('production')
    expect(parseNavUrl('?view=tasks&tab=production').tab).toBeNull()
    expect(parseNavUrl('?view=rd&tab=something').tab).toBeNull()
  })

  it('parses project id', () => {
    expect(parseNavUrl('?view=projects&project=p1').projectId).toBe('p1')
  })
})

describe('navSearch', () => {
  const base: NavState = {
    page: 'dashboard',
    coworkId: null,
    deptId: null,
    projectId: null,
    tab: null,
  }

  it('returns empty for dashboard with no params', () => {
    expect(navSearch(base, '')).toBe('')
  })

  it('sets view for non-dashboard pages', () => {
    expect(navSearch({ ...base, page: 'tasks' }, '')).toBe('?view=tasks')
  })

  it('sets cowork/dept/project/tab params', () => {
    const state: NavState = {
      page: 'cowork-detail',
      coworkId: 'c1',
      deptId: null,
      projectId: null,
      tab: null,
    }
    expect(navSearch(state, '')).toBe('?view=cowork-detail&cowork=c1')
  })

  it('sets tab for ops', () => {
    const state: NavState = {
      page: 'ops',
      coworkId: null,
      deptId: null,
      projectId: null,
      tab: 'production',
    }
    expect(navSearch(state, '')).toBe('?view=ops&tab=production')
  })

  // I2: URL round-trip preserves nav state and foreign params
  it('preserves foreign params in original order', () => {
    const state: NavState = {
      page: 'cowork-detail',
      coworkId: 'c1',
      deptId: null,
      projectId: null,
      tab: null,
    }
    const result = navSearch(state, '?q=abc&ms=connected')
    expect(result).toContain('view=cowork-detail')
    expect(result).toContain('cowork=c1')
    expect(result).toContain('q=abc')
    expect(result).toContain('ms=connected')
    
    // Foreign params come after nav params
    const params = new URLSearchParams(result)
    expect(params.get('q')).toBe('abc')
    expect(params.get('ms')).toBe('connected')
  })

  it('round-trip preserves nav state', () => {
    const state: NavState = {
      page: 'cowork-detail',
      coworkId: 'c1',
      deptId: null,
      projectId: null,
      tab: null,
    }
    const search = navSearch(state, '?q=abc&ms=connected')
    const parsed = parseNavUrl(search)
    expect(parsed).toEqual(state)
  })

  it('removes nav params when null', () => {
    const state: NavState = {
      page: 'cowork',
      coworkId: null,
      deptId: null,
      projectId: null,
      tab: null,
    }
    const result = navSearch(state, '?view=cowork-detail&cowork=c1')
    expect(result).toBe('?view=cowork')
    expect(result).not.toContain('cowork=')
  })
})

// writeNavUrl tests are in appStore.nav.test.ts (jsdom environment)
