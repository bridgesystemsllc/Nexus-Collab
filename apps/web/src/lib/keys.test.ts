import { describe, it, expect, vi } from 'vitest'
import { onEnter } from './keys'
import type { KeyboardEvent } from 'react'

function createKeyEvent(
  key: string,
  opts: { isComposing?: boolean; shiftKey?: boolean } = {}
): KeyboardEvent<HTMLElement> {
  const preventDefault = vi.fn()
  return {
    key,
    shiftKey: opts.shiftKey ?? false,
    nativeEvent: {
      isComposing: opts.isComposing ?? false,
    },
    preventDefault,
  } as unknown as KeyboardEvent<HTMLElement>
}

describe('onEnter', () => {
  // I6: Enter never reaches native submit
  it('calls preventDefault and handler on Enter', () => {
    const handler = vi.fn()
    const e = createKeyEvent('Enter')

    onEnter(handler)(e)

    expect(e.preventDefault).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores non-Enter keys', () => {
    const handler = vi.fn()
    const events = [
      createKeyEvent('Escape'),
      createKeyEvent('Tab'),
      createKeyEvent('a'),
      createKeyEvent('Space'),
    ]

    events.forEach((e) => onEnter(handler)(e))

    expect(handler).not.toHaveBeenCalled()
    events.forEach((e) => expect(e.preventDefault).not.toHaveBeenCalled())
  })

  // T-W7: isComposing ignored
  it('ignores Enter during IME composition', () => {
    const handler = vi.fn()
    const e = createKeyEvent('Enter', { isComposing: true })

    onEnter(handler)(e)

    expect(handler).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  // T-W8: Shift+Enter ignored by default
  it('ignores Shift+Enter by default', () => {
    const handler = vi.fn()
    const e = createKeyEvent('Enter', { shiftKey: true })

    onEnter(handler)(e)

    expect(handler).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('handles Shift+Enter when allowShift is true', () => {
    const handler = vi.fn()
    const e = createKeyEvent('Enter', { shiftKey: true })

    onEnter(handler, { allowShift: true })(e)

    expect(e.preventDefault).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('handles regular Enter when allowShift is true', () => {
    const handler = vi.fn()
    const e = createKeyEvent('Enter', { shiftKey: false })

    onEnter(handler, { allowShift: true })(e)

    expect(e.preventDefault).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
  })
})
