import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ActiveBrief {
  id: string
  companyName: string
  dateOfRequest: string
  projectName: string
  brand: string
  subBrand: string
  contractManufacturer: string
  briefStatus: string
  phase: number
  projectContacts: { name: string; role: string; email: string }[]
  projectObjective: string
  ingredients: string
  targetAvailabilityDate: string
  targetFormulaDate: string
  targetStabilityDate: string
  targetScaleUpDate?: string
  markets: string[]
  targetRetailPrice: string
  projectedAnnualVolume: string
  moq: string
  targetCostPerUnit: string
  productDescription: string
  isCurrentLine: boolean
  consumerExperience: string
  feel: string
  fragrance: string
  appearance: string
  restrictedIngredients: string
  requestedIngredients: string
  keyBenefits: string
  copyClaims: string
  clinicalClaims: string
  typicalUsage: string
  retailChain: string
  targetDemographics: string
  intendedPackage: string
  intendedClosure: string
  packagingMaterial: string
  labelType: string
  labelArtwork: string
  secondaryPackage: string
  kitCombos?: string
  packagingCostPerUnit?: string
  casePackout: string
  benchmarkImageUrl?: string
  teamMembers: { name: string; role: string }[]
  supportingDocs: { name: string; url: string; source: string }[]
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function generateBriefPDF(brief: ActiveBrief): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const tableStyle = {
    headStyles: {
      fillColor: [245, 245, 245] as [number, number, number],
      textColor: [55, 53, 47] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 9,
      cellPadding: 4,
    },
    bodyStyles: {
      textColor: [55, 53, 47] as [number, number, number],
      fontSize: 9,
      cellPadding: 3.5,
    },
    styles: {
      lineColor: [204, 204, 204] as [number, number, number],
      lineWidth: 0.25,
    },
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
  }

  function addSectionHeader(title: string) {
    if (y > 250) {
      doc.addPage()
      y = margin
    }
    y += 4
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(55, 53, 47)
    doc.text(title, margin, y)
    y += 1
    doc.setDrawColor(204, 204, 204)
    doc.setLineWidth(0.5)
    doc.line(margin, y, margin + contentWidth, y)
    y += 5
  }

  function addText(text: string, fontSize = 10) {
    doc.setFontSize(fontSize)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(55, 53, 47)
    const lines = doc.splitTextToSize(text || '—', contentWidth)
    if (y + lines.length * 4.5 > 275) {
      doc.addPage()
      y = margin
    }
    doc.text(lines, margin, y)
    y += lines.length * 4.5
  }

  // ─── Header ─────────────────────────────────────────────
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(55, 53, 47)
  doc.text(brief.companyName || 'KarEve, LLC', margin, y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 119, 116)
  const dateText = `Date of Request: ${formatDate(brief.dateOfRequest)}`
  const dateWidth = doc.getTextWidth(dateText)
  doc.text(dateText, pageWidth - margin - dateWidth, y)

  y += 8
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(55, 53, 47)
  doc.text('Project Initiation Brief', margin, y)
  y += 6
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(brief.projectName || '—', margin, y)
  y += 4

  doc.setFontSize(9)
  doc.setTextColor(120, 119, 116)
  const infoLine = [
    brief.brand && `Brand: ${brief.brand}`,
    brief.subBrand && `Sub-Brand: ${brief.subBrand}`,
    brief.contractManufacturer && `CM: ${brief.contractManufacturer}`,
    `Status: ${brief.briefStatus || 'Draft'}`,
    `Phase: ${brief.phase}/5`,
  ]
    .filter(Boolean)
    .join('  |  ')
  doc.text(infoLine, margin, y)
  y += 8

  // ─── Project Contacts ───────────────────────────────────
  if (brief.projectContacts?.length > 0) {
    addSectionHeader('PROJECT CONTACTS')
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Title / Role', 'Email']],
      body: brief.projectContacts.map((c) => [c.name || '—', c.role || '—', c.email || '—']),
      ...tableStyle,
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─── Project Objective ──────────────────────────────────
  addSectionHeader('PROJECT OBJECTIVE')
  addText(brief.projectObjective)
  if (brief.ingredients) {
    y += 2
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(55, 53, 47)
    doc.text('Ingredients:', margin, y)
    y += 4
    addText(brief.ingredients, 9)
  }

  // ─── Business Information ───────────────────────────────
  addSectionHeader('BUSINESS INFORMATION')
  autoTable(doc, {
    startY: y,
    head: [['Field', 'Value']],
    body: [
      ['Target Product Availability', formatDate(brief.targetAvailabilityDate)],
      ['Target Final Formula Date', formatDate(brief.targetFormulaDate)],
      ['Target Stability Start', formatDate(brief.targetStabilityDate)],
      ['Target Scale Up Date', formatDate(brief.targetScaleUpDate || '')],
      ['Markets', (brief.markets || []).join(', ') || '—'],
      ['Target Retail Price', brief.targetRetailPrice || '—'],
      ['Projected Annual Volume', brief.projectedAnnualVolume || '—'],
      ['MOQ', brief.moq || '—'],
      ['Target Cost Per Unit', brief.targetCostPerUnit || '—'],
    ],
    ...tableStyle,
    columnStyles: { 0: { fontStyle: 'bold' as const, cellWidth: 65 } },
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Design Criteria ────────────────────────────────────
  addSectionHeader('DESIGN CRITERIA')
  autoTable(doc, {
    startY: y,
    head: [['Criteria', 'Details']],
    body: [
      ['Product Description', brief.productDescription || '—'],
      ['Current Product Line?', brief.isCurrentLine ? 'Yes' : 'No'],
      ['Consumer Experience', brief.consumerExperience || '—'],
      ['Feel', brief.feel || '—'],
      ['Fragrance', brief.fragrance || '—'],
      ['Appearance', brief.appearance || '—'],
      ['Restricted Ingredients', brief.restrictedIngredients || '—'],
      ['Requested Ingredients', brief.requestedIngredients || '—'],
      ['Key Benefits', brief.keyBenefits || '—'],
      ['Copy Claims', brief.copyClaims || '—'],
      ['Clinical Claims', brief.clinicalClaims || '—'],
      ['Typical Usage', brief.typicalUsage || '—'],
      ['Target Retail Chain', brief.retailChain || '—'],
    ],
    ...tableStyle,
    columnStyles: { 0: { fontStyle: 'bold' as const, cellWidth: 55 } },
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Package Design Criteria ────────────────────────────
  addSectionHeader('PACKAGE DESIGN CRITERIA')
  autoTable(doc, {
    startY: y,
    head: [['Criteria', 'Details']],
    body: [
      ['Target Demographics', brief.targetDemographics || '—'],
      ['Intended Package', brief.intendedPackage || '—'],
      ['Intended Closure', brief.intendedClosure || '—'],
      ['Packaging Material', brief.packagingMaterial || '—'],
      ['Label Type', brief.labelType || '—'],
      ['Label Artwork Colors', brief.labelArtwork || '—'],
      ['Secondary Package', brief.secondaryPackage || '—'],
      ['Kit / Combos', brief.kitCombos || '—'],
      ['Packaging Cost Per Unit', brief.packagingCostPerUnit || '—'],
      ['Case Packout', brief.casePackout || '—'],
    ],
    ...tableStyle,
    columnStyles: { 0: { fontStyle: 'bold' as const, cellWidth: 55 } },
  })
  y = (doc as any).lastAutoTable.finalY + 6

  // ─── Team Members ───────────────────────────────────────
  if (brief.teamMembers?.length > 0) {
    addSectionHeader('TEAM MEMBERS')
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Title / Role']],
      body: brief.teamMembers.map((m) => [m.name || '—', m.role || '—']),
      ...tableStyle,
    })
  }

  // ─── Save ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const filename = `PIB_${sanitizeFilename(brief.projectName || 'Brief')}_${today}.pdf`
  doc.save(filename)
}
