import { describe, it, expect } from 'vitest'
import { inlineEditReducer, currentDraft, INITIAL, type InlineEditState } from './inlineEdit'

const reduce = (state: InlineEditState<string>, ...events: Parameters<typeof inlineEditReducer<string>>[1][]) =>
  events.reduce((s, e) => inlineEditReducer(s, e), state)

describe('inlineEditReducer', () => {
  it('starts in read mode', () => {
    expect(INITIAL).toEqual({ phase: 'read' })
  })

  it('BEGIN seeds the draft from the current value', () => {
    expect(reduce(INITIAL, { type: 'BEGIN', value: 'hello' }))
      .toEqual({ phase: 'editing', draft: 'hello' })
  })

  it('CHANGE updates the draft', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' })
    expect(s).toEqual({ phase: 'editing', draft: 'ab' })
  })

  it('CANCEL discards the draft and returns to read', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' }, { type: 'CANCEL' })
    expect(s).toEqual({ phase: 'read' })
  })

  it('SUBMIT moves to saving, carrying the draft', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' }, { type: 'SUBMIT' })
    expect(s).toEqual({ phase: 'saving', draft: 'ab' })
  })

  it('RESOLVED returns to read', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'SUBMIT' }, { type: 'RESOLVED' })
    expect(s).toEqual({ phase: 'read' })
  })

  it('REJECTED preserves the draft — typed text is never discarded', () => {
    const s = reduce(
      INITIAL,
      { type: 'BEGIN', value: 'a' },
      { type: 'CHANGE', draft: 'a long edit' },
      { type: 'SUBMIT' },
      { type: 'REJECTED', message: 'Server said no' },
    )
    expect(s).toEqual({ phase: 'failed', draft: 'a long edit', message: 'Server said no' })
  })

  it('CHANGE after a failure clears the message and resumes editing', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'CHANGE', draft: 'xy' }))
      .toEqual({ phase: 'editing', draft: 'xy' })
  })

  it('SUBMIT retries directly from a failure', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'SUBMIT' })).toEqual({ phase: 'saving', draft: 'x' })
  })

  it('CANCEL from a failure returns to read', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'CANCEL' })).toEqual({ phase: 'read' })
  })

  it('ignores CHANGE and BEGIN while saving, so an in-flight save is not corrupted', () => {
    const saving: InlineEditState<string> = { phase: 'saving', draft: 'x' }
    expect(inlineEditReducer(saving, { type: 'CHANGE', draft: 'y' })).toBe(saving)
    expect(inlineEditReducer(saving, { type: 'BEGIN', value: 'z' })).toBe(saving)
  })

  it('ignores SUBMIT in read mode', () => {
    expect(inlineEditReducer(INITIAL, { type: 'SUBMIT' })).toBe(INITIAL)
  })
})

describe('currentDraft', () => {
  it('returns the fallback in read mode', () => {
    expect(currentDraft(INITIAL as InlineEditState<string>, 'saved')).toBe('saved')
  })

  it('returns the draft in every other phase', () => {
    expect(currentDraft({ phase: 'editing', draft: 'd' }, 'saved')).toBe('d')
    expect(currentDraft({ phase: 'saving', draft: 'd' }, 'saved')).toBe('d')
    expect(currentDraft({ phase: 'failed', draft: 'd', message: 'm' }, 'saved')).toBe('d')
  })
})
