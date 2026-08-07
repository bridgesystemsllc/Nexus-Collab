import { describe, it, expect } from 'vitest'
import { payloadToCsv } from './generate'

// The CSV export is rendered from the stored payload rather than re-queried, so
// its job is to lose nothing and to survive the values a report actually
// contains — commas in project titles, quotes in blocker reasons, nulls
// everywhere.

describe('payloadToCsv', () => {
  it('writes one titled section per array of objects', () => {
    const csv = payloadToCsv({
      blockedAging: [
        { number: 1, title: 'Ship samples', daysBlocked: 4 },
        { number: 2, title: 'Approve art', daysBlocked: 9 },
      ],
      overdueMilestones: [{ name: 'Gate 1', due: '2026-01-05' }],
    })

    expect(csv).toContain('# blockedAging')
    expect(csv).toContain('number,title,daysBlocked')
    expect(csv).toContain('1,Ship samples,4')
    expect(csv).toContain('# overdueMilestones')
    expect(csv).toContain('name,due')
  })

  it('escapes commas, quotes and newlines rather than corrupting the row', () => {
    const csv = payloadToCsv({
      rows: [
        { title: 'Retail, wholesale', reason: 'He said "no"', note: 'line one\nline two' },
      ],
    })

    expect(csv).toContain('"Retail, wholesale"')
    expect(csv).toContain('"He said ""no"""')
    expect(csv).toContain('"line one\nline two"')
  })

  it('unions columns across rows so a field only some rows have is not dropped', () => {
    const csv = payloadToCsv({
      rows: [{ a: 1 }, { a: 2, b: 'present' }],
    })
    const header = csv.split('\n')[1]
    expect(header).toBe('a,b')
    // The row missing `b` still lines up with the header.
    expect(csv).toContain('1,')
    expect(csv).toContain('2,present')
  })

  it('renders nested objects and arrays instead of writing [object Object]', () => {
    const csv = payloadToCsv({
      rows: [{ departments: ['Ops', 'Marketing'], gate: { name: 'G1', due: '2026-02-01' } }],
    })
    expect(csv).toContain('Ops; Marketing')
    expect(csv).toContain('{""name"":""G1"",""due"":""2026-02-01""}')
    expect(csv).not.toContain('[object Object]')
  })

  it('puts scalar and non-array fields in a summary block so nothing is silently lost', () => {
    const csv = payloadToCsv({
      reportType: 'STATUS_UPDATE',
      generatedAt: '2026-01-10T00:00:00.000Z',
      counts: { total: 4 },
      rows: [{ a: 1 }],
    })

    expect(csv).toContain('# summary')
    expect(csv).toContain('field,value')
    expect(csv).toContain('reportType,STATUS_UPDATE')
    // A nested object field is serialised, not dropped.
    expect(csv).toContain('counts,')
    expect(csv).toContain('total')
  })

  it('skips empty arrays rather than emitting a headerless section', () => {
    const csv = payloadToCsv({ blocked: [], rows: [{ a: 1 }] })
    expect(csv).not.toContain('# blocked')
    expect(csv).toContain('# rows')
  })

  it('renders null and undefined as empty cells, not the strings "null"/"undefined"', () => {
    const csv = payloadToCsv({ rows: [{ a: null, b: undefined, c: 0, d: false }] })
    const dataRow = csv.split('\n').find((l) => l.startsWith(',') || /^,{0,3}0/.test(l))
    expect(csv).not.toContain('null')
    expect(csv).not.toContain('undefined')
    // 0 and false are real values and must survive.
    expect(dataRow).toContain('0')
    expect(dataRow).toContain('false')
  })

  it('is deterministic — the same payload exports byte-identical CSV', () => {
    const payload = {
      reportType: 'PROJECT_UPDATE',
      blocked: [{ number: 3, title: 'b' }, { number: 1, title: 'a' }],
    }
    expect(payloadToCsv(payload)).toBe(payloadToCsv(payload))
  })
})
