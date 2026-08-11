// State machine behind InlineEdit.
//
// Extracted from the component because the web vitest environment is `node`
// with no DOM — the same reason ganttScale and ripple are pure modules. The
// behaviour worth protecting is here and unit tested; the component is a thin
// view over it.
//
// The rule that matters: a rejected save keeps the draft. Discarding what
// someone typed because the server was briefly unhappy is the failure mode
// this machine exists to prevent.

export type InlineEditState<T> =
  | { phase: 'read' }
  | { phase: 'editing'; draft: T }
  | { phase: 'saving'; draft: T }
  | { phase: 'failed'; draft: T; message: string }

export type InlineEditEvent<T> =
  | { type: 'BEGIN'; value: T }
  | { type: 'CHANGE'; draft: T }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT' }
  | { type: 'RESOLVED' }
  | { type: 'REJECTED'; message: string }

export const INITIAL: InlineEditState<never> = { phase: 'read' }

export function inlineEditReducer<T>(
  state: InlineEditState<T>,
  event: InlineEditEvent<T>,
): InlineEditState<T> {
  switch (state.phase) {
    case 'read':
      return event.type === 'BEGIN' ? { phase: 'editing', draft: event.value } : state

    case 'editing':
      switch (event.type) {
        case 'CHANGE': return { phase: 'editing', draft: event.draft }
        case 'SUBMIT': return { phase: 'saving', draft: state.draft }
        case 'CANCEL': return { phase: 'read' }
        default: return state
      }

    // A save is in flight; nothing may mutate the draft under it.
    case 'saving':
      switch (event.type) {
        case 'RESOLVED': return { phase: 'read' }
        case 'REJECTED': return { phase: 'failed', draft: state.draft, message: event.message }
        default: return state
      }

    case 'failed':
      switch (event.type) {
        case 'CHANGE': return { phase: 'editing', draft: event.draft }
        case 'SUBMIT': return { phase: 'saving', draft: state.draft }
        case 'CANCEL': return { phase: 'read' }
        default: return state
      }
  }
}

/** The value the input should show: the draft if there is one, else what is saved. */
export function currentDraft<T>(state: InlineEditState<T>, fallback: T): T {
  return state.phase === 'read' ? fallback : state.draft
}
