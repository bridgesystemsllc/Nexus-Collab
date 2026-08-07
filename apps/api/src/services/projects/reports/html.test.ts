import { describe, it, expect } from 'vitest'
import { renderReportEmail, escapeHtml } from './html'

// Everything in an emailed report comes from user-entered data — project
// titles, task titles, blocker reasons, an edited narrative. All of it is
// interpolated into HTML, so escaping is the thing worth testing hardest.

describe('escapeHtml', () => {
  it('escapes the characters that would break out of an attribute or a tag', () => {
    expect(escapeHtml(`<script>alert('x')</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;',
    )
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;')
  })

  it('renders null and undefined as empty, not as the words', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('renderReportEmail', () => {
  const base = {
    title: 'Project update — Ambi Q2',
    reportType: 'PROJECT_UPDATE' as const,
    payload: {
      reportType: 'PROJECT_UPDATE',
      generatedAt: '2026-08-03T12:00:00.000Z',
      period: { start: '2026-07-27', end: '2026-08-03' },
      header: { title: 'Ambi Q2', status: 'ACTIVE', health: 88 },
    },
  }

  it('escapes a hostile project title rather than emitting it as markup', () => {
    const html = renderReportEmail({
      ...base,
      title: '<img src=x onerror=alert(1)>',
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes hostile content inside table cells', () => {
    const html = renderReportEmail({
      ...base,
      payload: {
        ...base.payload,
        blocked: [{ number: 1, title: '</td><script>alert(1)</script>', reason: null }],
      },
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes the narrative, which is editable free text', () => {
    const html = renderReportEmail({ ...base, narrative: 'Watch <b>this</b> & that' })
    expect(html).toContain('Watch &lt;b&gt;this&lt;/b&gt; &amp; that')
  })

  it('renders the narrative as paragraphs on blank lines', () => {
    const html = renderReportEmail({ ...base, narrative: 'First para.\n\nSecond para.' })
    expect(html).toContain('<p style="margin:0 0 10px">First para.</p>')
    expect(html).toContain('<p style="margin:0 0 10px">Second para.</p>')
  })

  it('renders headline fields from nested groups', () => {
    const html = renderReportEmail(base)
    expect(html).toContain('Header · Status')
    expect(html).toContain('ACTIVE')
    expect(html).toContain('88')
  })

  it('flattens a distribution into one line instead of a two-column table', () => {
    const html = renderReportEmail({
      ...base,
      reportType: 'EXECUTIVE_ROLLUP',
      payload: {
        ...base.payload,
        healthDistribution: [{ key: 'GREEN', count: 4 }, { key: 'AMBER', count: 1 }],
      },
    })
    expect(html).toContain('GREEN 4 · AMBER 1')
    expect(html).not.toContain('>Key<')
  })

  it('surfaces top-level scalars that sit outside a named group', () => {
    const html = renderReportEmail({
      ...base,
      reportType: 'EXECUTIVE_ROLLUP',
      payload: { ...base.payload, onTimeMilestonePercent: 73 },
    })
    expect(html).toContain('On Time Milestone Percent')
    expect(html).toContain('73')
  })

  it('flattens a grouped section into one table with the group as a column', () => {
    const html = renderReportEmail({
      ...base,
      payload: {
        ...base.payload,
        completedThisPeriod: [
          { department: 'Ops', tasks: [{ number: 3, title: 'Ship pallets' }] },
        ],
      },
    })
    expect(html).toContain('Ship pallets')
    expect(html).toContain('Ops')
    expect(html).toContain('Completed this period')
  })

  it('omits empty sections rather than printing an empty table', () => {
    const html = renderReportEmail({ ...base, payload: { ...base.payload, blocked: [] } })
    expect(html).not.toContain('>Blocked<')
  })

  it('renders a report whose payload predates a current field, without throwing', () => {
    // The whole point of storing payloads: an old snapshot has old keys.
    const html = renderReportEmail({
      title: 'Old report',
      reportType: 'STATUS_UPDATE',
      payload: { reportType: 'STATUS_UPDATE', somethingRetired: [{ a: 1, b: 'x' }] },
    })
    expect(html).toContain('Something Retired')
    expect(html).toContain('Old report')
  })

  it('includes a deep link when given one, and escapes it', () => {
    const html = renderReportEmail({ ...base, viewUrl: 'https://x.test/?report=abc&y=1' })
    expect(html).toContain('href="https://x.test/?report=abc&amp;y=1"')
    expect(html).toContain('Open in Nexus')
  })

  it('omits the link section entirely when no url is given', () => {
    expect(renderReportEmail(base)).not.toContain('Open in Nexus')
  })
})
