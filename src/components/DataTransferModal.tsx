import { useMemo, useState } from 'react'
import { Download, FileUp, RefreshCw, X } from 'lucide-react'
import { supabase, type CmdbItem } from '../lib/supabase'
import type { ClientWithItems } from '../hooks/useCmdbData'
import {
  CMDB_CSV_COLUMNS as COLUMNS,
  escapeCsv,
  parseCsv,
  type CmdbImportRow as ImportRow,
} from '../lib/csv'

type Props = {
  clients: ClientWithItems[]
  items: CmdbItem[]
  canImport: boolean
  onClose: () => void
  onImported: () => Promise<void>
}

export default function DataTransferModal({ clients, items, canImport, onClose, onImported }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')

  const errors = useMemo(() => rows.flatMap((row, index) => {
    const rowErrors: string[] = []
    if (!row.client) rowErrors.push(`Row ${index + 2}: client is required`)
    if (!row.category) rowErrors.push(`Row ${index + 2}: category is required`)
    if (!row.name) rowErrors.push(`Row ${index + 2}: name is required`)
    if (row.qty && (!Number.isInteger(Number(row.qty)) || Number(row.qty) < 0)) {
      rowErrors.push(`Row ${index + 2}: qty must be a non-negative integer`)
    }
    if (row.expiration_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiration_date)) {
      rowErrors.push(`Row ${index + 2}: expiration_date must use YYYY-MM-DD`)
    }
    return rowErrors
  }), [rows])

  const exportCsv = () => {
    const header = COLUMNS.join(',')
    const lines = items.map(item => {
      const client = clients.find(candidate => candidate.id === item.client_id)
      const row: ImportRow = {
        client: client?.name ?? '',
        category: item.category ?? '',
        item_type: item.item_type ?? '',
        name: item.name ?? '',
        vendor: item.vendor ?? '',
        branch: item.branch ?? '',
        qty: String(item.qty ?? 1),
        ip: item.ip ?? '',
        serial: item.serial ?? '',
        email: item.email ?? '',
        expiration_date: item.expiration_date ?? '',
        notes: item.notes ?? '',
        process: item.process ?? '',
        process_stale_days: String(item.process_stale_days ?? 5),
      }
      return COLUMNS.map(column => escapeCsv(row[column])).join(',')
    })
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cmdb-export-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const readFile = async (file?: File) => {
    if (!file) return
    setFileName(file.name)
    setMessage('')
    setRows(parseCsv(await file.text()))
  }

  const importCsv = async () => {
    if (!canImport || rows.length === 0 || errors.length > 0) return
    setImporting(true)
    setMessage('')
    try {
      const clientIds = new Map(clients.map(client => [client.name.trim().toLowerCase(), client.id]))
      for (const clientName of [...new Set(rows.map(row => row.client.trim()))]) {
        const key = clientName.toLowerCase()
        if (clientIds.has(key)) continue
        const { data, error } = await supabase.from('cmdb_clients')
          .insert({ name: clientName }).select('id').single()
        if (error) throw error
        clientIds.set(key, data.id)
      }

      const existing = new Set(items.map(item =>
        `${item.client_id}|${item.category}|${item.name}|${item.serial ?? ''}`.toLowerCase(),
      ))
      const payload = rows.flatMap(row => {
        const clientId = clientIds.get(row.client.trim().toLowerCase())
        if (!clientId) return []
        const key = `${clientId}|${row.category}|${row.name}|${row.serial}`.toLowerCase()
        if (existing.has(key)) return []
        existing.add(key)
        return [{
          client_id: clientId,
          category: row.category,
          item_type: row.item_type,
          name: row.name,
          vendor: row.vendor,
          branch: row.branch,
          qty: Number(row.qty || 1),
          ip: row.ip,
          serial: row.serial,
          email: row.email,
          expiration_date: row.expiration_date || null,
          notes: row.notes,
          process: row.process,
          process_updated_at: row.process ? new Date().toISOString() : null,
          process_stale_days: Math.min(365, Math.max(1, Number.parseInt(row.process_stale_days, 10) || 5)),
          updated_at: new Date().toISOString(),
        }]
      })
      if (payload.length > 0) {
        const { error } = await supabase.from('cmdb_items').insert(payload)
        if (error) throw error
      }
      await onImported()
      setMessage(`Import completed: ${payload.length} new record(s), ${rows.length - payload.length} duplicate(s) skipped.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="modal-surface flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div>
            <h3 className="font-semibold">Import / export CMDB</h3>
            <p className="text-xs text-slate-500">CSV excludes credentials and secret values.</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <button onClick={exportCsv} className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300 hover:bg-cyan-500/15">
            <Download size={16} /> Export {items.length} visible record(s)
          </button>
          {canImport && (
            <>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-800/40 px-4 py-8 text-sm text-slate-300 hover:border-cyan-500/50">
                <FileUp size={18} /> {fileName || 'Select CSV file'}
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={event => readFile(event.target.files?.[0])} />
              </label>
              {rows.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm">{rows.length} row(s) detected · {errors.length} validation error(s)</p>
                  {errors.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                      {errors.map(error => <p key={error}>{error}</p>)}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead className="bg-slate-950 text-slate-500"><tr>{COLUMNS.slice(0, 7).map(column => <th key={column} className="px-3 py-2 text-left">{column}</th>)}</tr></thead>
                      <tbody>{rows.slice(0, 10).map((row, index) => <tr key={index} className="border-t border-slate-800">{COLUMNS.slice(0, 7).map(column => <td key={column} className="max-w-40 truncate px-3 py-2">{row[column]}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          {message && <p className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-300">{message}</p>}
        </div>
        {canImport && (
          <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
            <button onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-sm">Close</button>
            <button onClick={importCsv} disabled={importing || rows.length === 0 || errors.length > 0} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm disabled:opacity-40">
              {importing && <RefreshCw size={14} className="animate-spin" />} Import valid rows
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
