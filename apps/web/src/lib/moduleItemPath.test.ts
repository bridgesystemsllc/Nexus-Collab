import { describe, it, expect } from 'vitest'
import { moduleItemPath, MissingModuleItemIdError } from './moduleItemPath'

describe('moduleItemPath', () => {
  describe('valid inputs', () => {
    it('builds full path with real departmentId and itemId', () => {
      expect(
        moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/d1/modules/m1/items/i1')
    })

    it('builds path without items segment when itemId is undefined', () => {
      expect(
        moduleItemPath({ departmentId: 'd1', moduleId: 'm1' })
      ).toBe('/departments/d1/modules/m1')
    })

    it('substitutes _ for null departmentId', () => {
      expect(
        moduleItemPath({ departmentId: null, moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/_/modules/m1/items/i1')
    })

    it('substitutes _ for undefined departmentId', () => {
      expect(
        moduleItemPath({ moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/_/modules/m1/items/i1')
    })

    it('substitutes _ for empty departmentId', () => {
      expect(
        moduleItemPath({ departmentId: '', moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/_/modules/m1/items/i1')
    })

    it('substitutes _ for whitespace-only departmentId', () => {
      expect(
        moduleItemPath({ departmentId: '   ', moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/_/modules/m1/items/i1')
    })

    it('encodes special characters in segments', () => {
      expect(
        moduleItemPath({ departmentId: 'dept/id', moduleId: 'mod id', itemId: 'item&id' })
      ).toBe('/departments/dept%2Fid/modules/mod%20id/items/item%26id')
    })
  })

  describe('invalid moduleId', () => {
    it('throws MissingModuleItemIdError for null moduleId', () => {
      expect(() => moduleItemPath({ moduleId: null, itemId: 'i1' }))
        .toThrow(MissingModuleItemIdError)
      try {
        moduleItemPath({ moduleId: null, itemId: 'i1' })
      } catch (err) {
        expect((err as MissingModuleItemIdError).field).toBe('moduleId')
      }
    })

    it('throws MissingModuleItemIdError for undefined moduleId', () => {
      expect(() => moduleItemPath({ moduleId: undefined, itemId: 'i1' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for empty moduleId', () => {
      expect(() => moduleItemPath({ moduleId: '', itemId: 'i1' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for whitespace-only moduleId', () => {
      expect(() => moduleItemPath({ moduleId: '   ', itemId: 'i1' }))
        .toThrow(MissingModuleItemIdError)
    })
  })

  describe('invalid itemId (when provided)', () => {
    it('throws MissingModuleItemIdError for null itemId', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: null }))
        .toThrow(MissingModuleItemIdError)
      try {
        moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: null })
      } catch (err) {
        expect((err as MissingModuleItemIdError).field).toBe('itemId')
      }
    })

    it('throws MissingModuleItemIdError for empty itemId', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: '' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for "undefined" string itemId', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'undefined' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for "UNDEFINED" string itemId (case-insensitive)', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'UNDEFINED' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for "null" string itemId', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'null' }))
        .toThrow(MissingModuleItemIdError)
    })

    it('throws MissingModuleItemIdError for "NULL" string itemId (case-insensitive)', () => {
      expect(() => moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'NULL' }))
        .toThrow(MissingModuleItemIdError)
    })
  })

  describe('spec invariants', () => {
    it('I1: no request URL contains an undefined/empty id segment', () => {
      expect(
        moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: 'i1' })
      ).toBe('/departments/d1/modules/m1/items/i1')

      // When itemId is provided (not undefined), these are invalid
      const badItemIdValues = [null, '', 'undefined', 'null'] as const
      for (const bad of badItemIdValues) {
        expect(() => 
          moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: bad as any })
        ).toThrow(MissingModuleItemIdError)
      }

      // undefined itemId is valid - it means "don't include items segment"
      expect(
        moduleItemPath({ departmentId: 'd1', moduleId: 'm1', itemId: undefined })
      ).toBe('/departments/d1/modules/m1')
    })
  })
})
