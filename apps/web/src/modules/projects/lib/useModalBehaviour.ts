import { useEffect, useRef } from 'react'

// ─── Modal keyboard behaviour ────────────────────────────────
// Escape closes, Tab is trapped inside, focus moves in on open and returns to
// whatever opened it on close (quality bar §10).
//
// One hook rather than per-modal handlers, because the failure mode of
// reimplementing this each time is not a visible bug — it is one dialog out of
// six where Tab silently walks off into the page behind it.

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Generic over the element type: dialogs hang this on a <div>, the task drawer
// on an <aside>, and a hook that only fits one of them invites a second copy.
export function useModalBehaviour<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  // Held in a ref so a parent re-rendering with a new closure does not tear
  // down and re-add the listener, which would drop focus mid-interaction.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter((el) => el.offsetParent !== null || el === document.activeElement)

    // Move focus in, preferring the first real control over the container.
    const first = focusables()[0]
    if (first) first.focus()
    else ref.current?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        // Nothing focusable inside — keep focus on the dialog rather than
        // letting Tab escape to the page underneath.
        e.preventDefault()
        ref.current?.focus()
        return
      }

      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      const active = document.activeElement

      // Wrap at both ends, and pull focus back in if it has already escaped.
      if (e.shiftKey && (active === firstItem || !ref.current?.contains(active))) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && (active === lastItem || !ref.current?.contains(active))) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      // Return focus where it came from, but not if the opener has since been
      // unmounted — focusing a detached node silently drops focus to <body>.
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return ref
}
