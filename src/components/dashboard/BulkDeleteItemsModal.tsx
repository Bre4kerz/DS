import { useMemo, useState } from 'react'
import { CheckCircle, Search, Trash2, X } from 'lucide-react'
import { bulkDeleteItems, type CmdbItem } from '../../lib/supabase'

export default function BulkDeleteItemsModal({ clientId, clientName, category, items, onClose, onCompleted }: {
  clientId: string
  clientName: string
  category: string
  items: CmdbItem[]
  onClose: () => void
  onCompleted: () => void | Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmation, setConfirmation] = useState('')
  const [working, setWorking] = useState(false)
  const [deletedCount, setDeletedCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter(item => [item.name, item.item_type, item.domain_version, item.ip, item.serial]
      .some(value => value?.toLowerCase().includes(query)))
  }, [items, search])
  const expectedConfirmation = `DELETE ${selectedIds.size}`
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id))

  const toggleItem = (itemId: string) => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    setConfirmation('')
    setError('')
  }

  const toggleVisible = () => {
    setSelectedIds(previous => {
      const next = new Set(previous)
      if (allVisibleSelected) filteredItems.forEach(item => next.delete(item.id))
      else filteredItems.forEach(item => next.add(item.id))
      return next
    })
    setConfirmation('')
    setError('')
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0 || confirmation !== expectedConfirmation) return
    setWorking(true)
    setError('')
    try {
      const count = await bulkDeleteItems({
        clientId,
        category,
        itemIds: Array.from(selectedIds),
      })
      setDeletedCount(count)
      await onCompleted()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the selected records')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!working) onClose() }}>
      <div className="modal-surface flex max-h-[86vh] w-full max-w-xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <div className="flex items-center gap-2 text-rose-300">
              <Trash2 size={20} />
              <h3 className="text-lg font-semibold text-white">Delete multiple records</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">{clientName} · {category}</p>
          </div>
          <button type="button" onClick={onClose} disabled={working} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Close bulk deletion">
            <X size={18} />
          </button>
        </div>

        {deletedCount !== null ? (
          <div className="p-5">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
              <CheckCircle size={30} className="mx-auto text-emerald-300" />
              <p className="mt-2 font-medium text-emerald-300">Deletion completed</p>
              <p className="mt-1 text-sm text-slate-400">{deletedCount} record(s) deleted.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
                <Search size={14} className="text-slate-500" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search records..."
                  className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <button
                type="button"
                onClick={toggleVisible}
                disabled={filteredItems.length === 0}
                className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-800/60 disabled:opacity-40"
              >
                <input type="checkbox" checked={allVisibleSelected} readOnly className="pointer-events-none" />
                <span>{allVisibleSelected ? 'Clear visible selection' : `Select all visible (${filteredItems.length})`}</span>
              </button>

              <div className="space-y-1.5">
                {filteredItems.map(item => (
                  <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    selectedIds.has(item.id)
                      ? 'border-rose-500/35 bg-rose-500/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{item.name || 'Unnamed record'}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                        {[item.item_type, item.domain_version || item.ip].filter(Boolean).join(' · ') || 'No additional details'}
                      </span>
                    </span>
                  </label>
                ))}
                {filteredItems.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">No records match this search.</p>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-800 p-4">
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                This permanently deletes {selectedIds.size} selected record(s), including their stored credentials and history.
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Type <span className="font-mono text-rose-300">{expectedConfirmation}</span> to confirm
                </label>
                <input
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  disabled={selectedIds.size === 0}
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-rose-500 disabled:opacity-40"
                />
              </div>
              {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {deletedCount !== null ? (
            <button type="button" onClick={onClose} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm hover:bg-cyan-500">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={working} className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40">Cancel</button>
              <button
                type="button"
                onClick={() => void deleteSelected()}
                disabled={selectedIds.size === 0 || confirmation !== expectedConfirmation || working}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-500 disabled:opacity-40"
              >
                {working ? 'Deleting…' : `Delete ${selectedIds.size} record(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
