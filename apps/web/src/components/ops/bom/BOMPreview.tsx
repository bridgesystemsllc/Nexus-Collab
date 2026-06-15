import type { Bom } from './bomTypes'

// Document-format colors — these are intrinsic to the BOM sheet layout and the
// XLSX export, NOT the app accent. Keep them literal so the on-screen preview
// visually agrees with the generated workbook.
const FILLER_BLUE = '#4472C4'
const ROW_GRAY = '#F2F2F2'
const PRIORITY_GRAY = '#D9D9D9'
const TOLERANCE_YELLOW = '#FFFF00'
const HEADER_BLACK = '#000000'
const BORDER = '#BFBFBF'

const cellBase: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  padding: '4px 8px',
  fontSize: '12px',
  color: '#000',
  verticalAlign: 'middle',
}

/**
 * Print stylesheet for the BOM document preview. Mount once where a print view
 * is rendered. Forces a clean, white, US-Letter-portrait, one-BOM-per-page
 * sheet so `window.print()` yields a faithful PDF.
 */
export function BOMPrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: letter portrait; margin: 0.5in; }
        body { background: #fff !important; }
        body * { visibility: hidden !important; }
        .bom-print-root, .bom-print-root * { visibility: visible !important; }
        .bom-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        .bom-print-page { page-break-after: always; }
        .bom-print-page:last-child { page-break-after: auto; }
        .bom-no-print { display: none !important; }
      }
    `}</style>
  )
}

/**
 * On-screen replica of the canonical Bill of Materials document — the same
 * visual the XLSX export produces. Used in the builder's live preview pane and
 * in the print view. Always renders on a white sheet regardless of app theme.
 */
export function BOMPreview({ bom }: { bom: Bom }) {
  const lines = [...(bom.lines || [])].sort((a, b) => (a.lineNo || 0) - (b.lineNo || 0))

  return (
    <div
      className="bom-print-page"
      style={{
        background: '#fff',
        color: '#000',
        fontFamily: 'Calibri, Arial, sans-serif',
        padding: '20px',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}
    >
      {/* Title */}
      <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px', letterSpacing: '0.02em' }}>
        BILL OF MATERIALS
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '40%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '26%' }} />
        </colgroup>
        <tbody>
          {/* Finished good header row */}
          <tr>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>FINISHED GOOD</td>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>PRODUCT NAME</td>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>Fill Claim</td>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>Min Fill</td>
          </tr>
          <tr>
            <td style={{ ...cellBase, fontWeight: 700 }}>{bom.fgPartNumber || ' '}</td>
            {/* Product name cell — white background per format */}
            <td style={{ ...cellBase, background: '#fff' }}>{bom.productName || ' '}</td>
            <td style={cellBase}>{bom.fillClaim || ' '}</td>
            <td style={cellBase}>{bom.minFill || ' '}</td>
          </tr>

          {/* Filler row */}
          <tr>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>FILLER(S)</td>
            <td
              style={{
                ...cellBase,
                fontWeight: 700,
                color: FILLER_BLUE,
                fontSize: '14px',
              }}
            >
              {bom.fillerName || ' '}
            </td>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>Case Qty</td>
            <td style={{ ...cellBase, fontWeight: 700, background: ROW_GRAY }}>Inner</td>
          </tr>
          <tr>
            <td style={cellBase}>{bom.fillerSupplier || ' '}</td>
            <td style={cellBase}>{' '}</td>
            <td style={{ ...cellBase, fontVariantNumeric: 'tabular-nums' }}>{bom.caseQty ?? ' '}</td>
            <td style={cellBase}>{bom.innerPack || ' '}</td>
          </tr>

          {/* Black header band */}
          <tr>
            {['Part Number', 'Item Description', 'UM', 'Supplier'].map((h) => (
              <th
                key={h}
                style={{
                  ...cellBase,
                  background: HEADER_BLACK,
                  color: '#fff',
                  fontWeight: 700,
                  textAlign: 'left',
                }}
              >
                {h}
              </th>
            ))}
          </tr>

          {/* Component rows */}
          {lines.length === 0 ? (
            <tr>
              <td style={{ ...cellBase, background: ROW_GRAY, color: '#888' }} colSpan={4}>
                No components yet
              </td>
            </tr>
          ) : (
            lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...cellBase, background: ROW_GRAY, fontFamily: 'Consolas, monospace' }}>{l.partNumber || ' '}</td>
                <td style={{ ...cellBase, background: ROW_GRAY }}>{l.description || ' '}</td>
                <td style={{ ...cellBase, background: ROW_GRAY, textAlign: 'center' }}>{l.um || ' '}</td>
                <td style={{ ...cellBase, background: ROW_GRAY }}>{l.supplier || ' '}</td>
              </tr>
            ))
          )}

          {/* Tolerance + priority footer */}
          <tr>
            <td style={{ ...cellBase, background: TOLERANCE_YELLOW, fontWeight: 700 }} colSpan={2}>
              OVER/UNDER RUN TOLERANCE :
            </td>
            <td style={{ ...cellBase, background: PRIORITY_GRAY, fontWeight: 700, textAlign: 'center' }}>
              Launch Priority (based on pack arrival)
            </td>
            <td style={{ ...cellBase, background: PRIORITY_GRAY, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {bom.launchPriority ?? ' '}
            </td>
          </tr>
          <tr>
            <td style={{ ...cellBase, background: TOLERANCE_YELLOW }} colSpan={2}>
              {bom.overUnderTolerance || ' '}
            </td>
            <td style={{ ...cellBase, background: PRIORITY_GRAY }} colSpan={2}>
              {' '}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
