import { describe, it, expect } from 'vitest'
import {
  erpStatusToDisplay,
  displayLabelToErpStatus,
  ERP_PO_STATUSES,
} from './productionStatus'

describe('erpStatusToDisplay', () => {
  it('maps a known status to label + color token', () => {
    expect(erpStatusToDisplay('SENT_TO_VENDOR')).toEqual({
      label: 'Sent to Vendor',
      colorVar: '--info',
    })
    expect(erpStatusToDisplay('IN_PRODUCTION')).toEqual({
      label: 'In Production',
      colorVar: '--accent',
    })
    expect(erpStatusToDisplay('RECEIVED')).toEqual({
      label: 'Received',
      colorVar: '--success',
    })
    expect(erpStatusToDisplay('CANCELLED')).toEqual({
      label: 'Cancelled',
      colorVar: '--danger',
    })
  })

  it('falls back to Unknown for unmapped values', () => {
    expect(erpStatusToDisplay('WAT')).toEqual({
      label: 'Unknown',
      colorVar: '--text-tertiary',
    })
    expect(erpStatusToDisplay('')).toEqual({
      label: 'Unknown',
      colorVar: '--text-tertiary',
    })
  })
})

describe('displayLabelToErpStatus', () => {
  it('reverse-maps a label (case-insensitive) to the ERP enum', () => {
    expect(displayLabelToErpStatus('Sent to Vendor')).toBe('SENT_TO_VENDOR')
    expect(displayLabelToErpStatus('in production')).toBe('IN_PRODUCTION')
  })

  it('returns null for an unknown label', () => {
    expect(displayLabelToErpStatus('Nope')).toBeNull()
  })
})

describe('ERP_PO_STATUSES', () => {
  it('lists all 13 statuses', () => {
    expect(ERP_PO_STATUSES).toHaveLength(13)
    expect(ERP_PO_STATUSES).toContain('DRAFT')
    expect(ERP_PO_STATUSES).toContain('CLOSED')
  })
})
