import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseSheet, isSupportedFile, UnsupportedFileError, EmptySheetError } from './parseSheet'

const csv = (text: string) => Buffer.from(text, 'utf8')

async function xlsxBuffer(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Stock')
  rows.forEach((row) => ws.addRow(row))
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

describe('isSupportedFile', () => {
  it('accepts spreadsheet and csv extensions regardless of case', () => {
    expect(isSupportedFile('stock.xlsx')).toBe(true)
    expect(isSupportedFile('STOCK.XLS')).toBe(true)
    expect(isSupportedFile('stock.csv')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isSupportedFile('report.pdf')).toBe(false)
    expect(isSupportedFile('image.png')).toBe(false)
    expect(isSupportedFile('noextension')).toBe(false)
  })
})

describe('parseSheet — csv', () => {
  it('reads headers and rows', async () => {
    const sheet = await parseSheet(
      csv('Item,Description,On Hand\nAMB-1024,Fade Cream,1150\nCD-0088,Hair Milk,8400\n'),
      'stock.csv',
    )
    expect(sheet.headers).toEqual(['Item', 'Description', 'On Hand'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0]).toEqual({ Item: 'AMB-1024', Description: 'Fade Cream', 'On Hand': '1150' })
  })

  it('strips a UTF-8 BOM so the first header still matches', async () => {
    const sheet = await parseSheet(csv('﻿Item,On Hand\nAMB-1024,10\n'), 'stock.csv')
    expect(sheet.headers[0]).toBe('Item')
  })

  it('trims padded headers', async () => {
    const sheet = await parseSheet(csv('  Item  ,  On Hand  \nAMB-1024,10\n'), 'stock.csv')
    expect(sheet.headers).toEqual(['Item', 'On Hand'])
  })

  it('honours quoted fields containing commas', async () => {
    const sheet = await parseSheet(
      csv('Item,Description,On Hand\nAMB-1024,"Fade Cream, 2oz",1150\n'),
      'stock.csv',
    )
    expect(sheet.rows[0].Description).toBe('Fade Cream, 2oz')
  })

  it('drops blank and whitespace-only rows', async () => {
    const sheet = await parseSheet(
      csv('Item,On Hand\nAMB-1024,10\n\n , \nCD-0088,20\n'),
      'stock.csv',
    )
    expect(sheet.rows).toHaveLength(2)
  })

  it('keeps quantities as text for the mapper to validate', async () => {
    const sheet = await parseSheet(csv('Item,On Hand\nAMB-1024,"1,150"\n'), 'stock.csv')
    expect(sheet.rows[0]['On Hand']).toBe('1,150')
  })

  it('rejects a file with no header row', async () => {
    await expect(parseSheet(csv(''), 'stock.csv')).rejects.toThrow(EmptySheetError)
  })
})

describe('parseSheet — xlsx', () => {
  it('reads headers and rows', async () => {
    const buf = await xlsxBuffer([
      ['Item', 'Description', 'On Hand'],
      ['AMB-1024', 'Fade Cream', 1150],
      ['CD-0088', 'Hair Milk', 8400],
    ])
    const sheet = await parseSheet(buf, 'stock.xlsx')
    expect(sheet.headers).toEqual(['Item', 'Description', 'On Hand'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[1]).toEqual({ Item: 'CD-0088', Description: 'Hair Milk', 'On Hand': '8400' })
  })

  it('skips a title row and finds the real header beneath it', async () => {
    const buf = await xlsxBuffer([
      ['Geodis Inventory Report'],
      [],
      ['Item', 'On Hand'],
      ['AMB-1024', 10],
    ])
    const sheet = await parseSheet(buf, 'stock.xlsx')
    expect(sheet.headers).toEqual(['Item', 'On Hand'])
    expect(sheet.rows).toEqual([{ Item: 'AMB-1024', 'On Hand': '10' }])
  })

  it('drops trailing blank rows', async () => {
    const buf = await xlsxBuffer([
      ['Item', 'On Hand'],
      ['AMB-1024', 10],
      [],
      [null, null],
    ])
    const sheet = await parseSheet(buf, 'stock.xlsx')
    expect(sheet.rows).toHaveLength(1)
  })

  it('rejects an unsupported extension', async () => {
    await expect(parseSheet(Buffer.from('x'), 'report.pdf')).rejects.toThrow(UnsupportedFileError)
  })
})
