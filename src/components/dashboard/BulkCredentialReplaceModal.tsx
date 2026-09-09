import { useState } from 'react'
import { CheckCircle, KeyRound, X } from 'lucide-react'
import { bulkReplaceCredentials, type CredentialBulkField } from '../../lib/supabase'

const BULK_CREDENTIAL_FIELDS: Array<{ value: CredentialBulkField; label: string }> = [
  { value: 'password', label: 'Password' },
  { value: 'alternative_password', label: 'Alternative password' },
  { value: 'username', label: 'Username' },
  { value: 'alternative_username', label: 'Alternative username' },
]

export default function BulkCredentialReplaceModal({ clientId, clientName, category, onClose, onCompleted }: {
  clientId: string
  clientName: string
  category: string
  onClose: () => void
  onCompleted: () => void | Promise<void>
}) {
  const [field, setField] = useState<CredentialBulkField>('password')
  const [oldValue, setOldValue] = useState('')
  const [newValue, setNewValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showValues, setShowValues] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [updatedCount, setUpdatedCount] = useState<number | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const isPasswordField = field === 'password' || field === 'alternative_password'
  const valuesValid = oldValue.length > 0
    && newValue.length > 0
    && oldValue !== newValue
    && newValue === confirmation

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
      const count = await bulkReplaceCredentials({
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
        setPreviewCount(null)
        await onCompleted()
      }
    } catch (replacementError) {
      setError(replacementError instanceof Error ? replacementError.message : 'Could not replace credentials')
    } finally {
      setWorking(false)
    }
  }

  const inputType = isPasswordField && !showValues ? 'password' : 'text'

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { if (!working) onClose() }}>
      <div className="modal-surface w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <div className="flex items-center gap-2 text-cyan-300">
              <KeyRound size={20} />
              <h3 className="text-lg font-semibold text-white">Bulk credential replacement</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">{clientName} · {category}</p>
          </div>
          <button type="button" onClick={onClose} disabled={working} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40" aria-label="Close bulk credential replacement">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {updatedCount !== null ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <CheckCircle size={28} className="mx-auto text-emerald-300" />
              <p className="mt-2 font-medium text-emerald-300">Replacement completed</p>
              <p className="mt-1 text-sm text-slate-400">{updatedCount} record(s) updated.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Credential field</label>
                <select
                  value={field}
                  onChange={event => {
                    setField(event.target.value as CredentialBulkField)
                    setOldValue('')
                    setNewValue('')
                    setConfirmation('')
                    resetPreview()
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                >
                  {BULK_CREDENTIAL_FIELDS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {[{
                label: 'Current value (X)', value: oldValue, setter: setOldValue, autoComplete: 'current-password',
              }, {
                label: 'New value (Y)', value: newValue, setter: setNewValue, autoComplete: 'new-password',
              }, {
                label: 'Confirm new value', value: confirmation, setter: setConfirmation, autoComplete: 'new-password',
              }].map(input => (
                <div key={input.label}>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{input.label}</label>
                  <input
                    type={inputType}
                    value={input.value}
                    onChange={event => {
                      input.setter(event.target.value)
                      resetPreview()
                    }}
                    autoComplete={isPasswordField ? input.autoComplete : 'off'}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none focus:border-cyan-500"
                  />
                </div>
              ))}

              {isPasswordField && (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={showValues} onChange={event => setShowValues(event.target.checked)} />
                  Show values
                </label>
              )}

              {confirmation && confirmation !== newValue && (
                <p className="text-xs text-rose-400">The new values do not match.</p>
              )}
              {oldValue && newValue && oldValue === newValue && (
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
                    ? `${previewCount} exact match(es) found. Review the scope before replacing.`
                    : 'No exact matches were found in this client and category.'}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                Only exact matches in this client and category are affected. Stored passwords remain encrypted in Supabase Vault.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {updatedCount !== null ? (
            <button type="button" onClick={onClose} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm hover:bg-cyan-500">Done</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={working} className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void runReplacement(true)} disabled={!valuesValid || working} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 disabled:opacity-40">
                {working ? 'Checking…' : 'Check matches'}
              </button>
              <button type="button" onClick={() => void runReplacement(false)} disabled={!valuesValid || working || !previewCount} className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-40">
                Replace {previewCount ?? 0} record(s)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
