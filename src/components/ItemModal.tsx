import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { X, Save, Loader2, Lock, RefreshCw, ChevronDown } from 'lucide-react'
import { supabase, CmdbClient, CmdbItem, getItemStatus } from '../lib/supabase'

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
  onClose: () => void
  onSaved: () => void
}

type FormData = {
  client_id: string
  category: string
  item_type: string
  name: string
  domain_version: string
  role_use: string
  ip: string
  serial: string
  email: string
  expiration_date: string
  notes: string
  status: string
  process: string
  process_updated_at: string | null
  cred_user: string
  cred_password: string
  cred_user_alt: string
  cred_password_alt: string
  cred_notes: string
}

const EMPTY: FormData = {
  client_id: '', category: '', item_type: '', name: '',
  domain_version: '', role_use: '', ip: '', serial: '', email: '', expiration_date: '', notes: '',
  status: 'Sin fecha', process: '', process_updated_at: null,
  cred_user: '', cred_password: '', cred_user_alt: '', cred_password_alt: '', cred_notes: ''
}

const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 0.75rem center',
  paddingRight: '2.5rem'
}

const SELECT_CLASS = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-blue-500 outline-none transition-colors appearance-none bg-no-repeat"

export default function ItemModal({ item, clients, categories, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState<FormData>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newClient, setNewClient] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [showCreds, setShowCreds] = useState(false)
  const [showRenewal, setShowRenewal] = useState(false)

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
        ip: item.ip ?? '',
        serial: item.serial ?? '',
        email: item.email ?? '',
        expiration_date: item.expiration_date ?? '',
        notes: item.notes ?? '',
        status: item.status || getItemStatus(item.expiration_date),
        process: item.process ?? '',
        process_updated_at: item.process_updated_at ?? null,
        cred_user: item.cred_user ?? '',
        cred_password: item.cred_password ?? '',
        cred_user_alt: item.cred_user_alt ?? '',
        cred_password_alt: item.cred_password_alt ?? '',
        cred_notes: item.cred_notes ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [item])

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
    if (!form.client_id) { setError('Selecciona un cliente'); return }
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setError('')
    setSaving(true)
    const payload = {
      ...form,
      type: form.category,
      expiration_date: form.expiration_date || null,
      updated_at: new Date().toISOString(),
    }
    if (item) {
      // Build diff for history
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      const trackFields = ['name','category','item_type','ip','serial','expiration_date','status','process','notes','cred_user','cred_user_alt']
      trackFields.forEach(field => {
        const oldVal = (item as any)[field] ?? ''
        const newVal = (payload as any)[field] ?? ''
        if (String(oldVal) !== String(newVal)) {
          changes[field] = { from: oldVal, to: newVal }
        }
      })
      await supabase.from('cmdb_items').update({ ...payload, updated_by: user?.email ?? '' }).eq('id', item.id)
      if (Object.keys(changes).length > 0) {
        await supabase.from('cmdb_item_history').insert({
          item_id: item.id,
          user_email: user?.email ?? 'unknown',
          changes,
        })
      }
    } else {
      await supabase.from('cmdb_items').insert({ ...payload, updated_by: user?.email ?? '' })
    }
    setSaving(false)
    onSaved()
  }

  const itemTypes = form.category ? (ITEM_TYPES[form.category] ?? []) : []
  const isLicense = form.category === 'Licenses'
  const renewalStyle = {
    'OK':       { border: 'border-emerald-500/40', bg: 'bg-emerald-500/8',  icon: 'text-emerald-400', label: 'text-emerald-300' },
    'Próximo':  { border: 'border-amber-500/40',   bg: 'bg-amber-500/8',    icon: 'text-amber-400',   label: 'text-amber-300'   },
    'Vencido':  { border: 'border-rose-500/40',    bg: 'bg-rose-500/8',     icon: 'text-rose-400',    label: 'text-rose-300'    },
  }[form.status] ?? { border: 'border-slate-700', bg: '', icon: 'text-cyan-400', label: 'text-cyan-300' }



  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
          <h3 className="font-semibold text-lg">{item ? 'Editar registro' : 'Nuevo registro'}</h3>
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

            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Cliente *</label>
              <div className="flex gap-2">
                <select value={form.client_id} onChange={set('client_id')} className={SELECT_CLASS} style={SELECT_STYLE}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={newClient}
                  onChange={e => setNewClient(e.target.value)}
                  placeholder="Agregar nuevo cliente..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddClient() } }}
                />
                <button
                  type="button"
                  onClick={handleAddClient}
                  disabled={!newClient.trim() || addingClient}
                  className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap"
                >
                  {addingClient ? <Loader2 size={14} className="animate-spin" /> : '+ Agregar'}
                </button>
              </div>
            </div>

            {/* Categoría / Tipo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">Categoría *</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value, item_type: '' }))}
                  className={SELECT_CLASS} style={SELECT_STYLE}
                >
                  <option value="">Seleccionar...</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">Tipo</label>
                {itemTypes.length > 0 ? (
                  <select value={form.item_type} onChange={set('item_type')} className={SELECT_CLASS} style={SELECT_STYLE}>
                    <option value="">Seleccionar...</option>
                    {itemTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.item_type}
                    onChange={set('item_type')}
                    placeholder="Ej: Virtual, Physical..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors"
                  />
                )}
              </div>
            </div>

            <Field label="Nombre del sistema *" value={form.name} onChange={set('name')} placeholder="Ej: DC-01, FortiGate 100F..." />

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Dominio / Versión" value={form.domain_version} onChange={set('domain_version')} placeholder="domain.com / 10.0" />
                <Field label="Uso / Roles" value={form.role_use} onChange={set('role_use')} placeholder="PDC / ADP / DNS..." />
              </div>
            )}

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="IP / Identificador" value={form.ip} onChange={set('ip')} placeholder="XXX.XXX.XXX.XXX" mono />
                <Field label="Serial / Licencia" value={form.serial} onChange={set('serial')} placeholder="XXXX-XXXX-XXXX" mono />
              </div>
            )}

            {!isLicense && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Email de contacto" value={form.email} onChange={set('email')} placeholder="admin@empresa.com" type="email" />
                <Field label="Fecha de expiración" value={form.expiration_date} onChange={set('expiration_date')} type="date" />
              </div>
            )}

            {!isLicense && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Status</label>
                    <select value={form.status} onChange={set('status')} className={SELECT_CLASS} style={SELECT_STYLE}>
                      <option value="">Seleccionar...</option>
                      <option value="OK">OK</option>
                      <option value="Próximo">Próximo</option>
                      <option value="Vencido">Vencido</option>
                      <option value="Sin fecha">Sin fecha</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Process</label>
                    <select value={form.process} onChange={set('process')} className={SELECT_CLASS} style={SELECT_STYLE}>
                      <option value="">Seleccionar...</option>
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
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase tracking-wide">Notas</label>
                  <textarea
                    value={form.notes}
                    onChange={set('notes')}
                    rows={2}
                    placeholder="Información adicional..."
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
                    <span className={`text-sm font-medium ${renewalStyle.label}`}>Renovación de licencia</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${showRenewal ? 'rotate-180' : ''}`}
                  />
                </button>

                {showRenewal && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Serial / Licencia" value={form.serial} onChange={set('serial')} placeholder="XXXX-XXXX-XXXX" mono />
                      <Field label="Fecha de expiración" value={form.expiration_date} onChange={set('expiration_date')} type="date" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 uppercase tracking-wide">Status</label>
                        <select value={form.status} onChange={set('status')} className={SELECT_CLASS} style={SELECT_STYLE}>
                          <option value="">Seleccionar...</option>
                          <option value="OK">OK</option>
                          <option value="Próximo">Próximo</option>
                          <option value="Vencido">Vencido</option>
                          <option value="Sin fecha">Sin fecha</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-400 uppercase tracking-wide">Process</label>
                        <select value={form.process} onChange={set('process')} className={SELECT_CLASS} style={SELECT_STYLE}>
                          <option value="">Seleccionar...</option>
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
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Notas</label>
                      <textarea
                        value={form.notes}
                        onChange={set('notes')}
                        rows={2}
                        placeholder="Información adicional sobre la licencia..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Credentials Section */}
            <div className="border-t border-slate-700 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setShowCreds(v => !v)}
                className="flex w-full items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Lock size={16} className="text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-300">Credenciales de acceso</span>
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
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Usuario principal</label>
                      <input type="text" value={form.cred_user} onChange={set('cred_user')} placeholder="admin@empresa.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Contraseña principal</label>
                      <input type="password" value={form.cred_password} onChange={set('cred_password')} placeholder="••••••••"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Usuario alternativo</label>
                      <input type="text" value={form.cred_user_alt} onChange={set('cred_user_alt')} placeholder="support@empresa.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 uppercase tracking-wide">Contraseña alternativa</label>
                      <input type="password" value={form.cred_password_alt} onChange={set('cred_password_alt')} placeholder="••••••••"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase tracking-wide">Notas de credenciales</label>
                    <input type="text" value={form.cred_notes} onChange={set('cred_notes')} placeholder="Ej: MFA habilitado, cambiar cada 90 días..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-yellow-500 outline-none transition-colors" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end p-5 border-t border-slate-800 flex-shrink-0">
            <button type="button" onClick={onClose} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-5 py-2 rounded-xl text-sm shadow-lg shadow-cyan-600/20 transition-all"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {item ? 'Guardar cambios' : 'Crear registro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', mono
}: {
  label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-colors ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
