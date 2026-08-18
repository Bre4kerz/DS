export type CmdbImportRow = {
  client: string
  category: string
  item_type: string
  name: string
  vendor: string
  branch: string
  qty: string
  ip: string
  serial: string
  email: string
  expiration_date: string
  notes: string
  process: string
  process_stale_days: string
}

export const CMDB_CSV_COLUMNS: Array<keyof CmdbImportRow> = [
  'client', 'category', 'item_type', 'name', 'vendor', 'branch', 'qty',
  'ip', 'serial', 'email', 'expiration_date', 'notes', 'process', 'process_stale_days',
]

export const escapeCsv = (value: unknown) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

export function parseCsv(text: string): CmdbImportRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map(header => header.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line)
    return Object.fromEntries(CMDB_CSV_COLUMNS.map(column => {
      const index = headers.indexOf(column)
      return [column, index >= 0 ? values[index] ?? '' : '']
    })) as CmdbImportRow
  })
}
