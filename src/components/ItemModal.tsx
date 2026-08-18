import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { X, Save, Loader2, Lock, RefreshCw, ChevronDown } from 'lucide-react'
import {
  supabase,
  CmdbClient,
  CmdbItem,
  getItemStatus,
  hasCredentials,
  revealCredentials,
  saveCredentials,
} from '../lib/supabase'

const CATEGORIES = ['Servidores', 'NAS/Storage', 'Remote Access', 'OA Devices', 'Managed services', 'Licenses', 'Services', 'Firewall', 'VPN', 'Antivirus', 'Backup', 'Red', 'Otro']
const ITEM_TYPES: Record<string, string[]> = {
  'Servers': ['Virtual', 'Host', 'Physical'],
  'NAS/Storage': ['Physical', 'NAS', 'SAN'],
  'Remote Access': ['TeamViewer', 'AnyDesk', 'iDrac', 'VPN', 'RDP'],
  'OA Devices': ['Printer', 'Scanner', 'Label printer', 'Copier'],
  'Managed services': ['vCenter console', 'Backup', 'Antivirus', 'Monitoring', 'RMM'],
  'Licenses': ['Antivirus', 'Office', 'VMWare', 'Backup', 'OS'],
  'Services': ['Domain', 'DNS', 'Hosting', 'e-mail', 'SSL', 'CDN'],
  'Firewall': ['Fortinet', 'Cisco', 'Palo Alto', 'Sophos'],
  'VPN': ['Cisco', 'OpenVPN', 'WireGuard', 'Fortinet'],
  'Antivirus': ['ESET', 'TrendMicro', 'Kaspersky', 'Sophos', 'Defender'],
  'Backup': ['Veeam', 'Acronis', 'Veritas', 'Arcserve'],
}

type Props = {
  item: CmdbItem | null
  clients: CmdbClient[]
  categories: string[]
  licenseTypes: string[]
  canEditCredentials: boolean
  defaultClientId?: string
  defaultCategory?: string
  onClose: () => void
  onSaved: (savedItem: { id: string; client_id: string; category: string }) => Promise<void>
}

type FormData = {
  client_id: string
  category: string
  item_type: string
  name: string
  domain_version: string
  role_use: string
  vendor: string
  branch: string
  qty: string
  ip: string
  serial: string
  email: string
  expiration_date: string
  expiration_not_required: boolean
  notes: string
  status: string
  process: string
  process_updated_at: string | null
  process_stale_days: string
  cred_user: string
  cred_password: string
  cred_user_alt: string
  cred_password_alt: string
  cred_notes: string
}

const EMPTY: FormData = {
  client_id: '', category: '', item_type: '', name: '',
  domain_version: '', role_use: '', vendor: '', branch: '', qty: '1', ip: '', serial: '', email: '', expiration_date: '', expiration_not_required: false, notes: '',
  status: 'No date', process: '', process_updated_at: null, process_stale_days: '5',
  cred_user: '', cred_password: '', cred_user_alt: '', cred_password_alt: '', cred_notes: ''
}

const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 0.75rem center',
  paddingRight: '2.5rem'
}

const SELECT_CLASS = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none transition-colors appearance-none bg-no-repeat"

function CreatableCombobox({
  label,
  value,
  options,
  onChange,
  placeholder,
  helper,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder: string
  helper: string
}) {
  const [open, setOpen] = useState(false)
  const query = value.trim().toLowerCase()
  const hasExactMatch = options.some(option => option.toLowerCase() === query)
  const filterQuery = hasExactMatch ? '' : query
  const filteredOptions = options
    .filter(option => !filterQuery || option.toLowerCase().includes(filterQuery))
    .slice(0, 10)
  const isNewValue = value.trim() && !hasExactMatch

  return (
    <div className="space-y-1.5 relative">
      <label className="text-xs text-slate-400 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={event => {
            onChange(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false)
            if (event.key === 'Enter' && open) {
              event.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors"
        />
        <button
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(current => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-white"
          aria-label={`Toggle ${label.toLowerCase()} options`}
        >
          <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-40 mt-1.5 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl shadow-black/40">
            {filteredOptions.map(option => (
              <button
                key={option}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  option === value
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {option}
              </button>
            ))}
            {isNewValue && (
              <button
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => setOpen(false)}
                className="w-full rounded-lg border border-dashed border-cyan-500/30 px-3 py-2 text-left text-sm text-cyan-300 transition-colors hover:bg-cyan-500/10"
              >
                + Add “{value.trim()}”
              </button>
            )}
            {filteredOptions.length === 0 && !isNewValue && (
              <p className="px-3 py-3 text-center text-xs text-slate-500">No options found</p>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500">{helper}</p>
    </div>
  )
}

export default function ItemModal({ item, clients, categories, licenseTypes, canEditCredentials, defaultClientId, defaultCategory, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newClient, setNewClient] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [showCreds, setShowCreds] = useState(false)
  const [showRenewal, setShowRenewal] = useState(false)
  const [loadingCredentials, setLoadingCredentials] = useState(false)

  const allCategories = [...new Set([...CATEGORIES, ...categories])].sort()

  useEffect(() => {
    if (item) {
      setForm({
        client_id: item.client_id ?? '',
        category: item.category ?? '',
        item_type: item.item_type ?? '',
        name: item.name ?? '',
        domain_version: item.domain_version ?? '',
        role_use: item.role_use ?? '',
        vendor: item.vendor ?? '',
        branch: item.branch ?? '',
        qty: String(item.qty ?? 1),
        ip: item.ip ?? '',
        serial: item.serial ?? '',
        email: item.email ?? '',
        expiration_date: item.expiration_date ?? '',
        expiration_not_required: item.expiration_not_required ?? false,
        notes: item.notes ?? '',
        status: getItemStatus(item.expiration_date, item.expiration_not_required),
        process: item.process ?? '',
        process_updated_at: item.process_updated_at ?? null,
        process_stale_days: String(item.process_stale_days ?? 5),
        cred_user: '',
        cred_password: '',
        cred_user_alt: '',
        cred_password_alt: '',
        cred_notes: '',
      })
      if (canEditCredentials && hasCredentials(item)) {
        setLoadingCredentials(true)
        revealCredentials(item.id)
          .then(credentials => {
            setForm(current => ({
              ...current,
              cred_user: credentials.user,
              cred_password: credentials.password,
              cred_user_alt: credentials.user_alt,
              cred_password_alt: credentials.password_alt,
              cred_notes: credentials.notes,
            }))
          })
          .catch(fetchError => {
            setError(fetchError instanceof Error ? fetchError.message : 'Could not load credentials')
          })
          .finally(() => setLoadingCredentials(false))
      }
    } else {
      setForm({
        ...EMPTY,
        client_id: defaultClientId ?? '',
        category: defaultCategory ?? '',
      })
    }
  }, [item, canEditCredentials, defaultClientId, defaultCategory])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => {
      const updated = { ...f, [k]: e.target.value }
      if (k === 'expiration_date') {
        updated.status = getItemStatus(e.target.value || null)
      }
      if (k === 'process') {
        updated.process_updated_at = new Date().toISOString()
      }
      return updated
    })

  const setExpirationNotRequired = (checked: boolean) => {
    setForm(current => ({
      ...current,
      expiration_not_required: checked,
      expiration_date: checked ? '' : current.expiration_date,
      status: checked ? 'Not required' : getItemStatus(current.expiration_date || null),
    }))
  }

  const handleAddClient = async () => {
    if (!newClient.trim()) return
    setAddingClient(true)
    const { data } = await supabase
      .from('cmdb_clients')
      .insert({ name: newClient.trim() })
      .select()
      .single()
    if (data) {
      setForm(f => ({ ...f, client_id: data.id }))
      setNewClient('')
    }
    setAddingClient(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id) { setError('Select a client'); return }
    if (!form.name.trim()) { setError('Name is required'); return }
    setError('')
    setSaving(true)
    try {
    const {
      cred_user,
      cred_password,
      cred_user_alt,
      cred_password_alt,
      cred_notes,
      ...itemFields
    } = form
    const payload = {
      ...itemFields,
      type: form.category,
      qty: Math.max(0, Number.parseInt(form.qty, 10) || 0),
      process_stale_days: Math.min(365, Math.max(1, Number.parseInt(form.process_stale_days, 10) || 5)),
      expiration_date: form.expiration_date || null,
      status: getItemStatus(form.expiration_date || null, form.expiration_not_required),
      updated_at: new Date().toISOString(),
    }
    if (item) {
      // Build diff for history
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      const trackFields: Array<keyof typeof itemFields> = ['name','category','item_type','vendor','branch','qty','ip','serial','expiration_date','expiration_not_required','status','process','process_updated_at','process_stale_days','notes']
      trackFields.forEach(field => {
        const oldVal = item[field] ?? ''
        const newVal = payload[field] ?? ''
        if (String(oldVal) !== String(newVal)) {
          changes[field] = { from: oldVal, to: newVal }
        }
      })
      const { error: itemError } = await supabase.from('cmdb_items').update({ ...payload, updated_by: user?.email ?? '' }).eq('id', item.id)
      if (itemError) throw itemError
      if (canEditCredentials) await saveCredentials(item.id, {
        user: cred_user,
        password: cred_password,
        user_alt: cred_user_alt,
        password_alt: cred_password_alt,
        notes: cred_notes,
      })
      if (Object.keys(changes).length > 0) {
        await supabase.from('cmdb_item_history').insert({
          item_id: item.id,
          user_email: user?.email ?? 'unknown',
          changes,
        })
      }
      await onSaved({ id: item.id, client_id: form.client_id, category: form.category })
    } else {
      const { data: newItem, error: itemError } = await supabase
        .from('cmdb_items')
        .insert({ ...payload, updated_by: user?.email ?? '' })
        .select('id')
        .single()
      if (itemError) throw itemError
      if (canEditCredentials) await saveCredentials(newItem.id, {
        user: cred_user,
        password: cred_password,
        user_alt: cred_user_alt,
        password_alt: cred_password_alt,
        notes: cred_notes,
      })
      await onSaved({ id: newItem.id, client_id: form.client_id, category: form.category })
    }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save the record')
    } finally {
      setSaving(false)
    }
  }

  const itemTypes = form.category ? (ITEM_TYPES[form.category] ?? []) : []
  const isLicense = form.category === 'Licenses'
  const availableLicenseTypes = [...new Set([
    ...(ITEM_TYPES.Licenses ?? []),
    ...licenseTypes,
    ...(form.item_type ? [form.item_type] : []),
  ])].sort()
  const renewalStyle = {
    'OK':       { border: 'border-emerald-500/40', bg: 'bg-emerald-500/8',  icon: 'text-emerald-400', label: 'text-emerald-300' },
    'Expiring':  { border: 'border-amber-500/40',   bg: 'bg-amber-500/8',    icon: 'text-amber-400',   label: 'text-amber-300'   },
    'Expired':  { border: 'border-rose-500/40',    bg: 'bg-rose-500/8',     icon: 'text-rose-400',    label: 'text-rose-300'    },
  }[form.status] ?? { border: 'border-slate-700', bg: '', icon: 'text-cyan-400', label: 'text-cyan-300' }



  return (
    <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div
        className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <h3 className="font-semibold text-lg">{item ? 'Edit record' : 'New record'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Client */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Client *</label>
              <div className="flex gap-2">
                <select value={form.client_id} onChange={set('client_id')} className={SELECT_CLASS} style={SELECT_STYLE}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={newClient}
                  onChange={e => setNewClient(e.target.value)}
                  placeholder="Add new client..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClient() } }}
                />
                <button
                  type="button"
                  onClick={handleAddClient}
                  disabled={!newClient.trim() || addingClient}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap"
                >
                  {addingClient ? <Loader2 size={14} className="animate-spin" /> : '+ Add'}
                </button>
              </div>
            </div>

            {/* Categoría / Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CreatableCombobox
                label="Category *"
                value={form.category}
                options={allCategories}
                onChange={category => setForm(current => ({
                  ...current,
                  category,
                  item_type: category === current.category ? current.item_type : '',
                }))}
                placeholder="Select or enter a new category..."
                helper="You can enter a new category; it will be available in future records."
              />
              <CreatableCombobox
                label="Type"
                value={form.item_type}
                options={isLicense ? availableLicenseTypes : itemTypes}
                onChange={itemType => setForm(current => ({ ...current, item_type: itemType }))}
                placeholder={isLicense ? 'Select or enter a new license type...' : 'Select or enter a type...'}
                helper={isLicense
                  ? 'You can enter a new type; it will be available in future license records.'
                  : 'Select a suggested type or enter a custom value.'}
              />
            </div>

            <Field label="System name *" value={form.name} onChange={set('name')} placeholder="e.g. DC-01, FortiGate 100F..." />

            {isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Vendor" value={form.vendor} onChange={set('vendor')} placeholder="e.g. Microsoft, VMware..." />
                <Field label="Branch" value={form.branch} onChange={set('branch')} placeholder="e.g. HQ, Monterrey..." />
              </div>
            )}

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Domain / Version" value={form.domain_version} onChange={set('domain_version')} placeholder="domain.com / 10.0" />
                <Field label="Usage / Roles" value={form.role_use} onChange={set('role_use')} placeholder="PDC / ADP / DNS..." />
              </div>
            )}

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="IP / Identifier" value={form.ip} onChange={set('ip')} placeholder="XXX.XXX.XXX.XXX" mono />
                <Field label="Serial / License" value={form.serial} onChange={set('serial')} placeholder="XXXX-XXXX-XXXX" mono />
              </div>
            )}

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Contact email" value={form.email} onChange={set('email')} placeholder="admin@empresa.com" type="email" />
                <Field label="Expiration date" value={form.expiration_date} onChange={set('expiration_date')} type="date" disabled={form.expiration_not_required} />
              </div>
            )}

            {!isLicense && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.expiration_not_required}
                  onChange={event => setExpirationNotRequired(event.target.checked)}
                  className="h-4 w-4 accent-cyan-500"
                />
                No expiration date required
              </label>
            )}

            {!isLicense && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Status (automatic)</label>
                    <div className={`${SELECT_CLASS} cursor-default`} aria-live="polite">{form.status}</div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Process</label>
                    <select value={form.process} onChange={set('process')} className={SELECT_CLASS} style={SELECT_STYLE}>
                      <option value="">Select...</option>
                      <option value="RFQ or Notification received">RFQ or Notification received</option>
                      <option value="Waiting for PQ">Waiting for PQ</option>
                      <option value="Pending review">Pending review</option>
                      <option value="Quotation sent">Quotation sent</option>
                      <option value="1st reminder">1st reminder</option>
                      <option value="2nd reminder">2nd reminder</option>
                      <option value="Approved, waiting for PO">Approved, waiting for PO</option>
                      <option value="PO processed">PO processed</option>
                      <option value="Waiting for renewal process">Waiting for renewal process</option>
                    </select>
                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-500">
                      <span>
                        {form.process_updated_at
                          ? `Last follow-up: ${new Date(form.process_updated_at).toLocaleDateString()}`
                          : 'No follow-up recorded'}
                      </span>
                      <button
                        type="button"
                        disabled={!form.process}
                        onClick={() => setForm(current => ({ ...current, process_updated_at: new Date().toISOString() }))}
                        className="shrink-0 text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Mark follow-up now
                      </button>
                    </div>
                  </div>
                  <Field
                    label="Stalled after (days)"
                    value={form.process_stale_days}
                    onChange={set('process_stale_days')}
                    type="number"
                    min={1}
                    max={365}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={set('notes')}
                    rows={2}
                    placeholder="Additional info..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors resize-none"
                  />
                </div>
              </>
            )}

            {/* Renewal Section - solo para Licenses */}
            {isLicense && (
              <div className={`border-t pt-4 mt-2 transition-all ${renewalStyle.border} ${renewalStyle.bg}`}>
                <button
                  type="button"
                  onClick={() => setShowRenewal(v => !v)}
                  className="flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw size={16} className={renewalStyle.icon} />
                    <span className={`text-sm font-medium ${renewalStyle.label}`}>License renewal</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${showRenewal ? 'rotate-180' : ''}`}
                  />
                </button>

                {showRenewal && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Field label="Serial / License" value={form.serial} onChange={set('serial')} placeholder="XXXX-XXXX-XXXX" mono />
                      <Field label="QTY" value={form.qty} onChange={set('qty')} placeholder="1" type="number" />
                      <Field label="Expiration date" value={form.expiration_date} onChange={set('expiration_date')} type="date" disabled={form.expiration_not_required} />
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={form.expiration_not_required}
                        onChange={event => setExpirationNotRequired(event.target.checked)}
                        className="h-4 w-4 accent-cyan-500"
                      />
                      No expiration date required
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 uppercase tracking-wide">Status (automatic)</label>
                        <div className={`${SELECT_CLASS} cursor-default`} aria-live="polite">{form.status}</div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 uppercase tracking-wide">Process</label>
                        <select value={form.process} onChange={set('process')} className={SELECT_CLASS} style={SELECT_STYLE}>
                          <option value="">Select...</option>
                          <option value="RFQ or Notification received">RFQ or Notification received</option>
                          <option value="Waiting for PQ">Waiting for PQ</option>
                          <option value="Pending review">Pending review</option>
                          <option value="Quotation sent">Quotation sent</option>
                          <option value="1st reminder">1st reminder</option>
                          <option value="2nd reminder">2nd reminder</option>
                          <option value="Approved, waiting for PO">Approved, waiting for PO</option>
                          <option value="PO processed">PO processed</option>
                          <option value="Waiting for renewal process">Waiting for renewal process</option>
                        </select>
                        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-slate-500">
                          <span>
                            {form.process_updated_at
                              ? `Last follow-up: ${new Date(form.process_updated_at).toLocaleDateString()}`
                              : 'No follow-up recorded'}
                          </span>
                          <button
                            type="button"
                            disabled={!form.process}
                            onClick={() => setForm(current => ({ ...current, process_updated_at: new Date().toISOString() }))}
                            className="shrink-0 text-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Mark follow-up now
                          </button>
                        </div>
                      </div>
                      <Field
                        label="Stalled after (days)"
                        value={form.process_stale_days}
                        onChange={set('process_stale_days')}
                        type="number"
                        min={1}
                        max={365}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={set('notes')}
                        rows={2}
                        placeholder="Additional info about the license..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Credentials Section */}
            {canEditCredentials && <div className="border-t border-slate-700 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowCreds(v => !v)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-300">Access credentials</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform duration-200 ${showCreds ? 'rotate-180' : ''}`}
                />
              </button>

              {showCreds && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Main user</label>
                      <input type="text" value={form.cred_user} onChange={set('cred_user')} placeholder="admin@empresa.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Main password</label>
                      <input type="password" value={form.cred_password} onChange={set('cred_password')} placeholder="••••••••"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Alt. user</label>
                      <input type="text" value={form.cred_user_alt} onChange={set('cred_user_alt')} placeholder="support@empresa.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Alt. password</label>
                      <input type="password" value={form.cred_password_alt} onChange={set('cred_password_alt')} placeholder="••••••••"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Notes de credenciales</label>
                    <input type="text" value={form.cred_notes} onChange={set('cred_notes')} placeholder="Ej: MFA habilitado, cambiar cada 90 días..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                  </div>
                </div>
              )}
            </div>}
          </div>

          <div className="flex gap-2 justify-end p-5 border-t border-slate-800 flex-shrink-0">
            <button type="button" onClick={onClose} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingCredentials}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-5 py-2 rounded-xl text-sm shadow-lg shadow-cyan-600/20 transition-all"
            >
              {saving || loadingCredentials ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {loadingCredentials ? 'Loading credentials…' : item ? 'Save changes' : 'Create record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', mono, disabled = false, min, max
}: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string; mono?: boolean; disabled?: boolean; min?: number; max?: number
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        className={`w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
