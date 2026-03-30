import { useState } from 'react'
import { Check, MessageSquare, StickyNote } from 'lucide-react'

export interface Milestone {
  label: string
  completed: boolean
  completedDate?: string
  note?: string
}

export interface MilestoneTrackerProps {
  milestones: Milestone[]
  onComplete: (index: number) => void
  onAddNote: (index: number, note: string) => void
}

type MilestoneState = 'completed' | 'current' | 'upcoming'

function getMilestoneState(milestones: Milestone[], index: number): MilestoneState {
  if (milestones[index].completed) return 'completed'
  const firstIncomplete = milestones.findIndex((m) => !m.completed)
  return index === firstIncomplete ? 'current' : 'upcoming'
}

export function MilestoneTracker({ milestones, onComplete, onAddNote }: MilestoneTrackerProps) {
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null)
  const [noteIdx, setNoteIdx] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')

  const completedCount = milestones.filter((m) => m.completed).length
  const percent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0

  const handleConfirm = (idx: number) => {
    onComplete(idx)
    setConfirmIdx(null)
  }

  const handleSaveNote = (idx: number) => {
    if (!noteText.trim()) return
    onAddNote(idx, noteText.trim())
    setNoteText('')
    setNoteIdx(null)
  }

  return (
    <div>
      {/* Progress Summary */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)] tabular-nums">
            {completedCount}/{milestones.length}
          </span>
          {' '}milestones completed
          <span className="text-[var(--accent)] font-semibold ml-1.5 tabular-nums">({percent}%)</span>
        </p>
      </div>

      {/* Horizontal Stepper (desktop) */}
      <div className="hidden md:flex items-start">
        {milestones.map((milestone, idx) => {
          const state = getMilestoneState(milestones, idx)
          const isLast = idx === milestones.length - 1

          return (
            <div key={idx} className="flex items-start flex-1 min-w-0">
              <div className="flex flex-col items-center">
                {/* Circle */}
                <button
                  onClick={() => {
                    if (state !== 'completed') setConfirmIdx(idx)
                  }}
                  className="relative flex items-center justify-center w-8 h-8 rounded-full transition-all"
                  style={{
                    background:
                      state === 'completed'
                        ? 'var(--success)'
                        : state === 'current'
                          ? 'transparent'
                          : 'transparent',
                    border:
                      state === 'completed'
                        ? 'none'
                        : state === 'current'
                          ? '2px solid var(--accent)'
                          : '2px solid var(--border-default)',
                    cursor: state === 'completed' ? 'default' : 'pointer',
                  }}
                  title={state === 'completed' ? `Completed: ${milestone.completedDate}` : `Mark "${milestone.label}" as complete`}
                >
                  {state === 'completed' && <Check size={14} className="text-white" />}
                  {state === 'current' && (
                    <span
                      className="w-3 h-3 rounded-full bg-[var(--accent)]"
                      style={{ animation: 'pulse 2s ease-in-out infinite' }}
                    />
                  )}
                  {state === 'upcoming' && (
                    <span className="w-2 h-2 rounded-full bg-[var(--border-default)]" />
                  )}
                </button>

                {/* Label */}
                <p className="mt-2 text-[11px] font-medium text-center max-w-[80px] leading-tight text-[var(--text-primary)]">
                  {milestone.label}
                </p>

                {/* Completed date */}
                {milestone.completedDate && (
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{milestone.completedDate}</p>
                )}

                {/* Note indicator */}
                {milestone.note && (
                  <span
                    className="mt-1 text-[var(--accent)] cursor-help"
                    title={milestone.note}
                  >
                    <StickyNote size={11} />
                  </span>
                )}
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className="flex-1 h-[2px] mt-4 mx-1"
                  style={{
                    background: milestones[idx + 1]?.completed || getMilestoneState(milestones, idx + 1) === 'current'
                      ? 'var(--success)'
                      : 'var(--border-default)',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Vertical Stepper (mobile) */}
      <div className="md:hidden space-y-0">
        {milestones.map((milestone, idx) => {
          const state = getMilestoneState(milestones, idx)
          const isLast = idx === milestones.length - 1

          return (
            <div key={idx} className="flex gap-3">
              {/* Line + Circle */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => {
                    if (state !== 'completed') setConfirmIdx(idx)
                  }}
                  className="relative flex items-center justify-center w-7 h-7 rounded-full transition-all flex-shrink-0"
                  style={{
                    background:
                      state === 'completed'
                        ? 'var(--success)'
                        : 'transparent',
                    border:
                      state === 'completed'
                        ? 'none'
                        : state === 'current'
                          ? '2px solid var(--accent)'
                          : '2px solid var(--border-default)',
                    cursor: state === 'completed' ? 'default' : 'pointer',
                  }}
                >
                  {state === 'completed' && <Check size={12} className="text-white" />}
                  {state === 'current' && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]"
                      style={{ animation: 'pulse 2s ease-in-out infinite' }}
                    />
                  )}
                </button>
                {!isLast && (
                  <div
                    className="w-[2px] flex-1 min-h-[24px]"
                    style={{
                      background: state === 'completed' ? 'var(--success)' : 'var(--border-default)',
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="pb-4 min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">{milestone.label}</p>
                {milestone.completedDate && (
                  <p className="text-[11px] text-[var(--text-tertiary)]">{milestone.completedDate}</p>
                )}
                {milestone.note && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 italic">{milestone.note}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirmation Dialog */}
      {confirmIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmIdx(null)} />
          <div className="relative z-10 p-5 rounded-[12px] bg-[var(--bg-elevated)] border border-[var(--border-default)] shadow-xl max-w-sm w-full mx-4">
            <p className="text-[14px] text-[var(--text-primary)] font-medium mb-4">
              Mark &ldquo;{milestones[confirmIdx].label}&rdquo; as complete?
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmIdx(null)}
                className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirm(confirmIdx)}
                className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-white bg-[var(--success)] hover:opacity-90 transition-colors"
              >
                Yes, Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
