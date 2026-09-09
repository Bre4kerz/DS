import { useState } from 'react'
import { ArrowUpDown, CheckCircle, X } from 'lucide-react'
import { bulkReplaceItemField, type ItemBulkField } from '../../lib/supabase'

const BULK_ITEM_FIELDS: Array<{ value: ItemBulkField; label: string }> = [
  { value: 'item_type', label: 'Type' },
  { value: 'domain_version', label: 'Domain / Version' },
  { value: 'role_use', label: 'Usage / Role' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'branch', label: 'Branch' },
  { value: 'ip', label: 'IP / ID' },
  { value: 'serial', label: 'Serial / License' },
  { value: 'email', label: 'Email' },
  { value: 'process', label: 'Process' },
]

export default function BulkItemReplaceModal({ clientId, clientName, category, onClose, onCompleted }: {
  clientId: string
  clientName: string
  category: string
  onClose: () => void
  onCompleted: () => void | Promise<void>
}) {
  const [field, setField] = useState<ItemBulkField>('item_type')
  const [oldValue, setOldValue] = useState('')
  const [newValue, setNewValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [clearConfirmed, setClearConfirmed] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [updatedCount, setUpdatedCount] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const isClearing = oldValue.length > 0 && newValue.length === 0
  const valuesValid = oldValue !== newValue && (
    isClearing ? clearConfirmed : newValue.trim().length > 0 && newValue === confirmation
  )

  const resetPreview = () => {
    setPreviewCount(null)
    setUpdatedCount(null)
    setError('')
  }

  const runReplacement = async (preview: boolean) => {
    if (!valuesValid) return
    setWorking(true)
    setError('')
    try {
      const count = await bulkReplaceItemField({
        clientId,
        category,
        field,
        oldValue,
        newValue,
        preview,
      })
      if (preview) {
        setPreviewCount(count)
      } else {
        setUpdatedCount(count)
        setOldValue('')
        setNewValue('')
        setConfirmation('')
        setClearConfirmed(false)
        setPreviewCount(null)
        await onCompleted()
      }
    } catch (replacementError) {
      setError(replacementError instanceof Error ? replacementError.message : 'Could not update the records')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!working) onClose() }}>
      <div className="modal-surface w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <div className="flex items-center gap-2 text-violet-300">
              <ArrowUpDown size={20} />
              <h3 className="text-lg font-semibold text-white">Bulk edit records</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">{clientName} · {category}</p>
          </div>
          <button type="button" onClick={onClose} disabled={working} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Close bulk record editing">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {updatedCount !== null ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <CheckCircle size={28} className="mx-auto text-emerald-300" />
              <p className="mt-2 font-medium text-emerald-300">Bulk update completed</p>
              <p className="mt-1 text-sm text-slate-400">{updatedCount} record(s) updated.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Field to update</label>
                <select
                  value={field}
                  onChange={event => {
                    setField(event.target.value as ItemBulkField)
                    setOldValue('')
                    setNewValue('')
                    setConfirmation('')
                    setClearConfirmed(false)
                    resetPreview()
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                >
                  {BULK_ITEM_FIELDS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {[{
                label: 'Current value', helper: 'Leave empty to match records with no value.', value: oldValue, setter: setOldValue,
              }, {
                label: 'New value', helper: '', value: newValue, setter: setNewValue,
              }].map(input => (
                <div key={input.label}>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{input.label}</label>
                  <input
                    type="text"
                    value={input.value}
                    onChange={event => {
                      input.setter(event.target.value)
                      setClearConfirmed(false)
                      resetPreview()
                    }}
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                  {input.helper && <p className="mt-1 text-[10px] text-slate-500">{input.helper}</p>}
                </div>
              ))}

              {isClearing ? (
                <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <input
                    type="checkbox"
                    checked={clearConfirmed}
                    onChange={event => {
                      setClearConfirmed(event.target.checked)
                      resetPreview()
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium">Clear this field</span>
                    <span className="mt-0.5 block text-[11px] opacity-75">Matching records will keep the field empty.</span>
                  </span>
                </label>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Confirm new value</label>
                  <input
                    type="text"
                    value={confirmation}
                    onChange={event => {
                      setConfirmation(event.target.value)
                      resetPreview()
                    }}
                    autoComplete="off"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-violet-500"
                  />
                </div>
              )}

              {!isClearing && confirmation && confirmation !== newValue && (
                <p className="text-xs text-rose-400">The new values do not match.</p>
              )}
              {newValue && oldValue === newValue && (
                <p className="text-xs text-amber-300">The new value must be different.</p>
              )}
              {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
              {previewCount !== null && (
                <div className={`rounded-xl border p-3 text-sm ${
                  previewCount > 0
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400'
                }`}>
                  {previewCount > 0
                    ? `${previewCount} exact match(es) found. Review the scope before updating.`
                    : 'No exact matches were found in this client and category.'}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Only exact matches in this client and category are affected. Every changed record is added to its history.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {updatedCount !== null ? (
            <button type="button" onClick={onClose} className="rounded-xl bg-violet-600 px-4 py-2 text-sm hover:bg-violet-500">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={working} className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void runReplacement(true)} disabled={!valuesValid || working} className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 disabled:opacity-40">
                {working ? 'Checking…' : 'Check matches'}
              </button>
              <button type="button" onClick={() => void runReplacement(false)} disabled={!valuesValid || working || !previewCount} className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-40">
                {isClearing ? 'Clear' : 'Update'} {previewCount ?? 0} record(s)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
