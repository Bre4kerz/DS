import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvLine } from '../lib/csv'

describe('CMDB CSV parser', () => {
  it('parses escaped commas and quotes', () => {
    expect(parseCsvLine('"Client, Inc.","License ""A"""')).toEqual([
      'Client, Inc.',
      'License "A"',
    ])
  })

  it('maps supported headers and ignores unknown columns', () => {
    const rows = parseCsv([
      'client,category,name,qty,unknown',
      'Acme,Licenses,Microsoft 365,10,value',
    ].join('\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      client: 'Acme',
      category: 'Licenses',
      name: 'Microsoft 365',
      qty: '10',
    })
  })
})
