import { describe, it, expect } from 'vitest'
import { briefDataForSave } from './briefPayload'
import { EMPTY_FORM } from './NewBriefModal'

describe('briefDataForSave', () => {
  describe('stripping row identity', () => {
    it('removes id from output', () => {
      const input = { ...EMPTY_FORM, id: 'item-123', projectName: 'Test Brief' }
      const result = briefDataForSave(input, false)
      expect(result).not.toHaveProperty('id')
    })

    it('removes moduleId from output', () => {
      const input = { ...EMPTY_FORM, moduleId: 'mod-123', projectName: 'Test Brief' }
      const result = briefDataForSave(input, false)
      expect(result).not.toHaveProperty('moduleId')
    })

    it('removes both id and moduleId when present', () => {
      const input = { ...EMPTY_FORM, id: 'x', moduleId: 'y', projectName: 'P' }
      const result = briefDataForSave(input, false)
      expect(result).not.toHaveProperty('id')
      expect(result).not.toHaveProperty('moduleId')
    })

    it('preserves all other form fields', () => {
      const input = {
        ...EMPTY_FORM,
        id: 'stale-id',
        moduleId: 'stale-mod',
        projectName: 'Test Project',
        brand: 'Test Brand',
        companyName: 'Test Company',
      }
      const result = briefDataForSave(input, false)
      expect(result.projectName).toBe('Test Project')
      expect(result.brand).toBe('Test Brand')
      expect(result.companyName).toBe('Test Company')
    })
  })

  describe('status handling', () => {
    it('sets briefStatus to Draft when isDraft is true', () => {
      const input = { ...EMPTY_FORM, briefStatus: 'In Formulation' as const }
      const result = briefDataForSave(input, true)
      expect(result.briefStatus).toBe('Draft')
    })

    it('preserves briefStatus when isDraft is false and status exists', () => {
      const input = { ...EMPTY_FORM, briefStatus: 'Stability Testing' as const }
      const result = briefDataForSave(input, false)
      expect(result.briefStatus).toBe('Stability Testing')
    })

    it('defaults to DEFAULT_BRIEF_STATUS when isDraft is false and no status', () => {
      const input = { ...EMPTY_FORM, briefStatus: '' as any }
      const result = briefDataForSave(input, false)
      expect(result.briefStatus).toBe('Start Brief')
    })
  })

  describe('phase handling', () => {
    it('preserves existing phase', () => {
      const input = { ...EMPTY_FORM, phase: 3 }
      const result = briefDataForSave(input, false)
      expect(result.phase).toBe(3)
    })

    it('defaults phase to 1 when missing or zero', () => {
      const input = { ...EMPTY_FORM, phase: 0 }
      const result = briefDataForSave(input, false)
      expect(result.phase).toBe(1)
    })

    it('defaults phase to 1 when undefined', () => {
      const input = { ...EMPTY_FORM }
      delete (input as any).phase
      const result = briefDataForSave(input, false)
      expect(result.phase).toBe(1)
    })
  })

  describe('spec invariants', () => {
    it('I2: persisted brief data never carries row identity', () => {
      const input = { ...EMPTY_FORM, id: 'x', moduleId: 'y', projectName: 'P' }
      const result = briefDataForSave(input, false)
      expect(result).not.toHaveProperty('id')
      expect(result).not.toHaveProperty('moduleId')
    })
  })
})
