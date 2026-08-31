import { describe, it, expect } from 'vitest'
import { detectFormat, UnknownReportFormatError } from './detectFormat'

const FORMAT_A_HEADER = ['Customer PO Number','Order','Item#','Description','Qtys','RemQty','Price','Value','OrdDt','ShipDt','Orig Date','Req.Del','WO','Comments']
const FORMAT_B_HEADER = ['PO',"Order Date","Orig Req'd Date",'PartNum','Cust Part','Description',"Req'd Date",'Qty Due','Unit Price','Job Num','Lvl1 Part','Lvl2Part','Description','QTY Need','UOM','CP?','Mfg Comment']

describe('detectFormat', () => {
  it('detects the customer open order report by its signature headers', () => {
    expect(detectFormat(FORMAT_A_HEADER)).toBe('customer_open_order')
  })
  it('detects the shortage report by its signature headers', () => {
    expect(detectFormat(FORMAT_B_HEADER)).toBe('open_order_shortage')
  })
  it('names the headers it did find when it recognises neither', () => {
    expect(() => detectFormat(['Widget', 'Sprocket'])).toThrow(UnknownReportFormatError)
    expect(() => detectFormat(['Widget', 'Sprocket'])).toThrow(/Widget, Sprocket/)
  })
  it('is insensitive to case and surrounding whitespace', () => {
    expect(detectFormat(['  customer po number ', 'ORDER', 'remqty'])).toBe('customer_open_order')
  })
})
