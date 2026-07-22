import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import logoImg from '../assets/logo1.png'
import {
  ChevronDown, ChevronRight, Search, Plus, RefreshCw, X, Filter,
  Server, HardDrive, Wifi, Printer, Shield, BadgeCheck, Globe, KeyRound,
  AlertTriangle, CheckCircle, Calendar, Monitor, Pencil, Trash2,
  Eye, EyeOff, Copy, Lock, LogOut, StickyNote, History, Copy as CopyIcon, Users
} from 'lucide-react'
import {
  supabase, CmdbClient, CmdbItem, getItemStatus, getDaysUntilExpiration, ItemHistory, UserRole,
  computeClientSummary, groupItemsByCategory, ClientSummary, SectionData,
  hasCredentials, getCredentials, Credentials
} from '../lib/supabase'
import ItemModal from './ItemModal'

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Servers': <Server size={18} />,
  'NAS/Storage': <HardDrive size={18} />,
  'Remote Access': <Wifi size={18} />,
  'OA Devices': <Printer size={18} />,
  'Managed services': <Shield size={18} />,
  'Licenses': <BadgeCheck size={18} />,
  'Services': <Globe size={18} />,
  'VPN': <KeyRound size={18} />,
  'Firewall': <Shield size={18} />,
  'Antivirus': <AlertTriangle size={18} />,
  'Backup': <HardDrive size={18} />,
}

type ClientWithItems = CmdbClient & {
  items: CmdbItem[]
  summary: ClientSummary
  sections: SectionData[]
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'OK': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Próximo': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Vencido': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    'Sin fecha': 'bg-slate-700 text-slate-300 border-slate-600',
  }
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles['Sin fecha']}`}>
      {status}
    </span>
  )
}

function CredentialField({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyValue = async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-2 text-xs text-slate-400">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-cyan-300 truncate">
          {value ? (show ? value : '••••••••••••') : '—'}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShow(!show)}
            disabled={!value}
            className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title={show ? 'Ocultar' : 'Mostrar'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={copyValue}
            disabled={!value}
            className={`rounded-lg p-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              copied ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700'
            }`}
            title={copied ? 'Copiado' : 'Copiar'}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function CredentialsPanel({ credentials }: { credentials: Credentials }) {
  const hasAny = credentials.user || credentials.password || credentials.user_alt || credentials.password_alt

  if (!hasAny) return null

  return (
    <div className="border-t border-slate-800 p-4 bg-slate-950/50">
      <div className="mb-4 flex items-center gap-2">
        <Lock size={16} className="text-yellow-400" />
        <h4 className="font-semibold text-yellow-300">Credenciales</h4>
        {credentials.notes && (
          <span className="text-xs text-slate-500 ml-auto">{credentials.notes}</span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CredentialField label="Usuario principal" value={credentials.user} />
        <CredentialField label="Contraseña principal" value={credentials.password} />
        <CredentialField label="Usuario alternativo" value={credentials.user_alt} />
        <CredentialField label="Contraseña alternativa" value={credentials.password_alt} />
      </div>
    </div>
  )
}

function SectionCard({ section, defaultOpen = false, isAdmin = true, highlightedItemId, onEdit, onDelete, onDuplicate, onHistory }: {
  section: SectionData
  defaultOpen?: boolean
  isAdmin?: boolean
  highlightedItemId?: string | null
  onEdit: (item: CmdbItem) => void
  onDelete: (id: string) => void
  onDuplicate: (item: CmdbItem) => void
  onHistory: (item: CmdbItem) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'type-asc' | 'type-desc'>('name-asc')
  const icon = CATEGORY_ICONS[section.title] || <Server size={18} />
  const hasExpiring = section.rows.some(r => r.status === 'Próximo' || r.status === 'Vencido')
  const hasCreds = section.rows.some(r => hasCredentials(r.item))

  const sortedRows = [...section.rows].sort((a, b) => {
    switch (sortBy) {
      case 'name-asc':  return a.item.name.localeCompare(b.item.name)
      case 'name-desc': return b.item.name.localeCompare(a.item.name)
      case 'type-asc':  return (a.item.item_type ?? '').localeCompare(b.item.item_type ?? '')
      case 'type-desc': return (b.item.item_type ?? '').localeCompare(a.item.item_type ?? '')
      default: return 0
    }
  })

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (highlightedItemId && section.rows.some(r => r.id === highlightedItemId)) {
      setOpen(true)
    }
  }, [highlightedItemId, section.rows])

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
      hasExpiring ? 'border-amber-500/20 shadow-lg shadow-amber-500/5' : 'border-slate-800/60'
    } bg-[#0a1220]`}>

      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3.5">
          <div className={`rounded-xl p-2.5 ${
            hasExpiring ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-300'
          }`}>
            {icon}
          </div>
          <div className="text-left">
            <h3 className="text-[15px] font-semibold text-white tracking-tight">{section.title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {section.rows.length} registros
              {hasCreds && ` · ${section.rows.filter(r => hasCredentials(r.item)).length} con credenciales`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasExpiring && (
            <span className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <AlertTriangle size={11} />
              Revisar expiraciones
            </span>
          )}
          {open ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800/60">

          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950/30">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
              Detalle de registros
            </p>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1 text-[11px] text-slate-400 outline-none cursor-pointer hover:border-slate-600 transition-colors"
            >
              <option value="name-asc">Nombre A-Z</option>
              <option value="name-desc">Nombre Z-A</option>
              <option value="type-asc">Tipo A-Z</option>
              <option value="type-desc">Tipo Z-A</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium w-10"></th>
                  <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2.5 text-left font-medium">Nombre</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Dominio / Versión</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Uso / Roles</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">IP / ID</th>
                  <th className="px-3 py-2.5 text-left font-medium w-28">Estado</th>
                  <th className="px-5 py-2.5 text-right font-medium w-32">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const isExpanded = expandedRows.has(row.id)
                  const creds = hasCredentials(row.item)
                  const isHighlighted = highlightedItemId === row.id

                  return (
                    <>
                      <tr
                        id={'item-' + row.id}
                        key={row.id}
                        className={`border-b border-slate-800/40 transition-all duration-300 ${
                          isHighlighted
                            ? 'bg-cyan-500/5'
                            : idx % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/20'
                        } hover:bg-slate-800/30`}
                      >
                        <td className="px-5 py-3">
                          {creds ? (
                            <button
                              onClick={() => toggleRow(row.id)}
                              className="p-1 rounded-md hover:bg-slate-700/50 transition-colors"
                            >
                              {isExpanded 
                                ? <ChevronDown size={14} className="text-cyan-400" />
                                : <ChevronRight size={14} className="text-cyan-400" />
                              }
                            </button>
                          ) : (
                            <span className="inline-block w-[22px]"></span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-slate-400 text-[12px]">{row.type || '—'}</span>
                        </td>

                        <td className="px-3 py-3">
                          <div>
                            <p className="text-white font-medium text-[13px]">{row.name || '—'}</p>
                            {row.item.notes && (
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">{row.item.notes}</p>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-slate-400 text-[12px]">{row.domain || '—'}</span>
                        </td>

                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-slate-500 text-[11px]">{row.role || '—'}</span>
                        </td>

                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span className="font-mono text-cyan-400/80 text-[11px]">{row.ip || '—'}</span>
                        </td>

                        <td className="px-3 py-3">
                          <StatusPill status={row.status} />
                        </td>

                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onHistory(row.item)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700/60 transition-all"
                              title="Historial"
                            >
                              <History size={13} />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => onDuplicate(row.item)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                                  title="Duplicar"
                                >
                                  <CopyIcon size={13} />
                                </button>
                                <button
                                  onClick={() => onEdit(row.item)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-blue-500/20 transition-all"
                                  title="Editar"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => onDelete(row.id)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                  title="Eliminar"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && creds && (
                        <tr>
                          <td colSpan={8} className="px-0 py-0">
                            <div className="bg-slate-950/40 border-t border-slate-800/30 px-5 py-4">
                              <div className="flex items-center gap-2 mb-3">
                                <Lock size={13} className="text-yellow-400/80" />
                                <h4 className="text-[11px] font-semibold text-yellow-300/90 uppercase tracking-wider">Credenciales</h4>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <CredentialField label="Usuario" value={getCredentials(row.item).user} />
                                <CredentialField label="Contraseña" value={getCredentials(row.item).password} />
                                <CredentialField label="Usuario alt." value={getCredentials(row.item).user_alt} />
                                <CredentialField label="Contraseña alt." value={getCredentials(row.item).password_alt} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sortedRows.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Server size={24} className="mx-auto mb-2 opacity-30" />
              No hay registros en esta sección
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isProcessStale(item: CmdbItem, staleDays = 5): boolean {
  const status = getItemStatus(item.expiration_date)
  if (status === 'OK' || status === 'Sin fecha') return false
  if (!item.process || item.process === '') return false
  if (!item.process_updated_at) return false
  const updated = new Date(item.process_updated_at)
  const now = new Date()
  const diff = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= staleDays
}

export default function DashboardCMDB() {
  const { user, signOut } = useAuth()
  const [clients, setClients] = useState<ClientWithItems[]>([])
  const [allItems, setAllItems] = useState<CmdbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState('Todos')
  const [statsModal, setStatsModal] = useState<null | 'clients' | 'total' | 'expiring' | 'critical'>(null)
  const [modalSearch, setModalSearch] = useState('')
  const [alertThreshold, setAlertThreshold] = useState<number>(365)
  const [showAlertConfig, setShowAlertConfig] = useState(false)
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const [alertStatus, setAlertStatus] = useState('Todos')
  const [categoryFilter, setCategoryFilter] = useState<string>('Todos')
  const [clientNotes, setClientNotes] = useState<string>('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [historyItem, setHistoryItem] = useState<CmdbItem | null>(null)
  const [history, setHistory] = useState<ItemHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('viewer')
  const [rolesModal, setRolesModal] = useState(false)
  const [allRoles, setAllRoles] = useState<UserRole[]>([])
  const [newRoleEmail, setNewRoleEmail] = useState('')
  const [newRoleValue, setNewRoleValue] = useState<'admin' | 'viewer'>('viewer')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CmdbItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [savingClient, setSavingClient] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: clientData }, { data: itemData }] = await Promise.all([
      supabase.from('cmdb_clients').select('*').order('name'),
      supabase.from('cmdb_items').select('*, cmdb_clients(id, name)').order('created_at', { ascending: false }),
    ])

    const processedClients: ClientWithItems[] = (clientData ?? []).map(client => {
      const clientItems = (itemData ?? [])
        .filter((i: CmdbItem & { cmdb_clients?: CmdbClient }) => i.client_id === client.id)
        .map((i: CmdbItem) => ({ ...i, expiration_date: i.expiration_date || null }))
      return {
        ...client,
        items: clientItems,
        summary: computeClientSummary(clientItems),
        sections: groupItemsByCategory(clientItems),
      }
    })

    setClients(processedClients)
    const normalizedItems = (itemData ?? []).map((i: CmdbItem) => ({
      ...i,
      expiration_date: i.expiration_date || null,
    }))
    setAllItems(normalizedItems)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    // Fetch user role
    if (user?.email) {
      supabase.from('cmdb_user_roles').select('*').eq('user_email', user.email).single()
        .then(({ data }) => {
          if (data) setUserRole(data.role as 'admin' | 'viewer')
          else setUserRole('admin') // default admin if no role set
        })
    }
  }, [fetchData, user])

  useEffect(() => {
    if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id)
    }
  }, [clients, selectedClientId])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return allItems
      .filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.ip?.toLowerCase().includes(q) ||
        i.serial?.toLowerCase().includes(q) ||
        i.domain_version?.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .map(i => ({
        item: i,
        client: clients.find(c => c.id === i.client_id),
      }))
  }, [search, allItems, clients])

  const allCategories = useMemo(() => {
    const cats = new Set(allItems.map(i => i.category).filter(Boolean))
    return ['Todos', ...Array.from(cats).sort()]
  }, [allItems])

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (categoryFilter !== 'Todos') {
        const hasCategory = c.items.some(i => i.category === categoryFilter)
        if (!hasCategory) return false
      }
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.items.some(i =>
          i.name.toLowerCase().includes(q) ||
          i.ip?.toLowerCase().includes(q) ||
          i.email?.toLowerCase().includes(q)
        )
      )
    })
  }, [clients, search, categoryFilter])

  useEffect(() => {
    if (!selectedClientId) { setClientNotes(''); return }
    const client = clients.find(c => c.id === selectedClientId)
    setClientNotes(client?.notes ?? '')
    setShowNotes(false)
  }, [selectedClientId, clients])

  const navigateToItem = (item: CmdbItem) => {
    setSearch('')
    setShowSearchDropdown(false)
    setSelectedClientId(item.client_id ?? null)
    // Open the section and highlight the item after navigation
    setOpenSections(prev => new Set([...prev, item.category]))
    setHighlightedItemId(item.id)
    setTimeout(() => {
      setHighlightedItemId(null)
    }, 3000)
    // Scroll to item after short delay
    setTimeout(() => {
      const el = document.getElementById('item-' + item.id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  const saveClientNotes = async () => {
    if (!selectedClientId) return
    setSavingNotes(true)
    await supabase.from('cmdb_clients').update({ notes: clientNotes }).eq('id', selectedClientId)
    setSavingNotes(false)
  }

  const duplicateItem = async (item: CmdbItem) => {
    const { id, created_at, updated_at, ...rest } = item
    await supabase.from('cmdb_items').insert({
      ...rest,
      name: rest.name + ' (copia)',
      updated_at: new Date().toISOString(),
    })
    fetchData()
  }

  const fetchHistory = async (item: CmdbItem) => {
    setHistoryItem(item)
    setLoadingHistory(true)
    const { data } = await supabase
      .from('cmdb_item_history')
      .select('*')
      .eq('item_id', item.id)
      .order('changed_at', { ascending: false })
      .limit(20)
    setHistory(data ?? [])
    setLoadingHistory(false)
  }

  const fetchRoles = async () => {
    const { data } = await supabase.from('cmdb_user_roles').select('*').order('created_at')
    setAllRoles(data as UserRole[] ?? [])
    setRolesModal(true)
  }

  const saveRole = async () => {
    if (!newRoleEmail.trim()) return
    await supabase.from('cmdb_user_roles').upsert({ user_email: newRoleEmail.trim(), role: newRoleValue }, { onConflict: 'user_email' })
    setNewRoleEmail('')
    fetchRoles()
  }

  const deleteRole = async (email: string) => {
    await supabase.from('cmdb_user_roles').delete().eq('user_email', email)
    fetchRoles()
  }

  const currentClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null
  }, [clients, selectedClientId, filteredClients])

  const globalStats = useMemo(() => ({
    clients: clients.length,
    total: allItems.length,
    expiring: allItems.filter(i => getItemStatus(i.expiration_date) === 'Próximo').length,
    critical: allItems.filter(i => getItemStatus(i.expiration_date) === 'Vencido').length,
    withCredentials: allItems.filter(i => hasCredentials(i)).length,
  }), [clients, allItems])

  const expiringItems = useMemo(() => {
    return allItems
      .filter(i => {
        if (!i.expiration_date) return false
        const days = getDaysUntilExpiration(i.expiration_date)
        const status = getItemStatus(i.expiration_date)
        if (days !== null && days > alertThreshold) return false
        if (alertStatus === 'Todos') return true
        return status === alertStatus
      })
      .sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      .slice(0, 12)
  }, [allItems, alertStatus, alertThreshold])


  const statsModalItems = useMemo(() => {
    switch (statsModal) {
      case 'total': return [...allItems].sort((a, b) => a.name.localeCompare(b.name))
      case 'expiring': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Próximo').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      case 'critical': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Vencido').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      default: return []
    }
  }, [statsModal, allItems])

  const handleDelete = async (id: string) => {
    await supabase.from('cmdb_items').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchData()
  }

  const handleEditClient = (client: ClientWithItems) => {
    setEditClientId(client.id)
    setEditClientName(client.name)
  }

  const handleSaveClientName = async () => {
    if (!editClientId || !editClientName.trim()) return
    setSavingClient(true)
    await supabase.from('cmdb_clients').update({ name: editClientName.trim() }).eq('id', editClientId)
    setSavingClient(false)
    setEditClientId(null)
    setEditClientName('')
    fetchData()
  }

  const handleDeleteClient = async (clientId: string) => {
    await supabase.from('cmdb_clients').delete().eq('id', clientId)
    setDeleteConfirm(null)
    if (selectedClientId === clientId) {
      setSelectedClientId(null)
    }
    fetchData()
  }

  const handleExport = () => {
    const clientItems = currentClient?.items ?? []
    const rows = [
      ['Cliente', 'Categoría', 'Tipo', 'Nombre', 'Dominio/Versión', 'Uso/Roles', 'IP', 'Serial', 'Email', 'Expiración', 'Estado', 'Usuario', 'Contraseña', 'Usuario Alt', 'Contraseña Alt', 'Notas'],
      ...clientItems.map(i => [
        currentClient?.name ?? '', i.category, i.item_type, i.name, i.domain_version, i.role_use,
        i.ip, i.serial, i.email, i.expiration_date ?? '', getItemStatus(i.expiration_date),
        i.cred_user, i.cred_password, i.cred_user_alt, i.cred_password_alt, i.notes
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `cmdb-${currentClient?.name ?? 'export'}.csv`
    a.click()
  }

  const categories = [...new Set(allItems.map(i => i.category).filter(Boolean))].sort()

  return (
    <div className="min-h-screen bg-[#050d18] text-white font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-30 relative">
        <div className="mx-auto max-w-[1800px] px-4 md:px-6 py-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center">
            <img src={logoImg} alt="JoSYS" className="h-8 md:h-10 w-auto object-contain brightness-125" />
          </div>
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 flex-col items-center">
            <span className="text-xl font-semibold text-slate-300 tracking-widest uppercase">Dashboard de Servicios</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Actualizar"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            {userRole === 'admin' && (
              <>
                <button
                  onClick={fetchRoles}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
                  title="Gestionar roles"
                >
                  <Users size={14} />
                  <span className="hidden md:inline">Roles</span>
                </button>
                <button
                  onClick={() => { setEditItem(null); setModalOpen(true) }}
                  className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-cyan-600/20 transition-all"
                >
                  <Plus size={14} /> Nuevo registro
                </button>
              </>
            )}
            <button
              onClick={() => signOut()}
              title={user?.email ?? 'Cerrar sesión'}
              className="flex items-center gap-2 bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 px-3 py-2.5 rounded-xl text-sm transition-all"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 shadow-xl h-fit">
            {/* Search */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 relative">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3">
                <Search size={16} className="text-slate-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSearchDropdown(true) }}
                  onFocus={() => setShowSearchDropdown(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      navigateToItem(searchResults[0].item)
                    }
                    if (e.key === 'Escape') { setSearch(''); setShowSearchDropdown(false) }
                  }}
                  placeholder="Buscar cliente, IP, sistema..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
                />
                {search && (
                  <button onClick={() => { setSearch(''); setShowSearchDropdown(false) }} className="text-slate-500 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
              {/* Search Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                  {searchResults.map(({ item, client }) => (
                    <button
                      key={item.id}
                      onClick={() => navigateToItem(item)}
                      className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left border-b border-slate-800 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.name}</p>
                        <p className="text-xs text-slate-400 truncate">{client?.name} · {item.category}</p>
                      </div>
                      {item.ip && <span className="text-xs text-cyan-400 font-mono flex-shrink-0">{item.ip}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setStatsModal('clients'); setModalSearch('') }} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-slate-600 hover:bg-slate-800 transition-all">
                <p className="text-xs text-slate-400">Clientes</p>
                <p className="mt-1 text-2xl font-bold">{globalStats.clients}</p>
              </button>
              <button onClick={() => { setStatsModal('total'); setModalSearch('') }} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-slate-600 hover:bg-slate-800 transition-all">
                <p className="text-xs text-slate-400">Items Totales</p>
                <p className="mt-1 text-2xl font-bold">{globalStats.total}</p>
              </button>

            </div>

            {/* Category Filter */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-wide px-1">Filtrar por categoría</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none"
              >
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Client List */}
            <div className="space-y-2">
              <p className="px-1 text-xs uppercase tracking-[0.25em] text-slate-500">Clientes</p>
              <div className="max-h-[700px] overflow-y-auto space-y-2 pr-1">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 animate-pulse">
                      <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-slate-800 rounded w-1/2" />
                    </div>
                  ))
                ) : filteredClients.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">No se encontraron clientes</p>
                ) : (
                  filteredClients.map(client => (
                    <div
                      key={client.id}
                      className={`w-full rounded-2xl border px-4 py-4 transition-all ${
                        selectedClientId === client.id
                          ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                          : 'border-slate-800 bg-slate-900 hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => setSelectedClientId(client.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{client.name}</p>
                            <p className="mt-1 text-xs text-slate-400">{client.sections.length} secciones</p>
                          </div>
                        </button>
                        <div className="flex items-start gap-1.5">
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              {client.summary.services}
                            </span>
                            {(client.summary.expiring > 0 || client.summary.critical > 0) && (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                                {client.summary.expiring + client.summary.critical} alertas
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEditClient(client) }}
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                              title="Editar cliente"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(`client:${client.id}`) }}
                              className="p-1.5 rounded-lg hover:bg-red-600/80 text-slate-400 hover:text-white transition-all"
                              title="Eliminar cliente"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/40 p-4 shadow-xl md:p-5">
            {/* Expiration alerts - always visible */}
     
            {expiringItems.length > 0 && (
  <div className="rounded-2xl border border-amber-500/15 bg-[#0a1220] overflow-hidden">
    {/* ===== HEADER RETRAÍBLE ===== */}
    <button
      onClick={() => setAlertsExpanded(v => !v)}
      className="flex w-full items-center justify-between px-5 py-4 border-b border-amber-500/10 bg-amber-500/[0.03] hover:bg-amber-500/[0.05] transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <Calendar size={16} className="text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-200">Alertas de expiración</h3>
          <p className="text-xs text-amber-400/60">{expiringItems.length} items requieren atención</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {expiringItems.length > 5 && alertsExpanded && (
          <span className="text-xs text-amber-400/50 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
            mostrando 5 de {expiringItems.length}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`text-slate-500 transition-transform duration-300 ${alertsExpanded ? '' : '-rotate-90'}`}
        />
      </div>
    </button>

    {/* ===== CONTENIDO (solo expandido) ===== */}
    {alertsExpanded && (
      <>
        {/* Barra de configuración compacta */}
        <div className="border-b border-amber-500/10 bg-slate-950/30 px-5 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-shrink-0">Umbral:</span>
          <div className="flex gap-1.5">
            {[30, 60, 90, 180, 365].map(d => (
              <button
                key={d}
                onClick={() => setAlertThreshold(d)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  alertThreshold === d
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-slate-700/50 mx-1" />
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-shrink-0">Status:</span>
          <div className="flex gap-1.5">
            {['Todos', 'Vencido', 'Próximo'].map(x => (
              <button
                key={x}
                onClick={() => setAlertStatus(x)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  alertStatus === x
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                {x}
              </button>
            ))}
          </div>
        </div>

        {/* ===== LISTA COMPACTA (máx 5 items) ===== */}
        <div className="divide-y divide-slate-800/40">
          {expiringItems.slice(0, 5).map(item => {
            const status = getItemStatus(item.expiration_date)
            const days = getDaysUntilExpiration(item.expiration_date)
            const client = clients.find(c => c.id === item.client_id)
            const isStale = isProcessStale(item)

            return (
              <div
                key={item.id}
                onClick={() => { setEditItem(item); setModalOpen(true) }}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors group ${
                  status === 'Vencido'
                    ? 'hover:bg-rose-500/[0.04]'
                    : 'hover:bg-amber-500/[0.04]'
                }`}
              >
                {/* Barra de severidad */}
                <div className={`w-[3px] h-6 rounded-full flex-shrink-0 ${
                  status === 'Vencido' ? 'bg-rose-500' : 'bg-amber-500'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 truncate">{client?.name}</span>
                    <span className="text-slate-700 text-xs">·</span>
                    <span className="text-xs text-slate-500">{item.category}</span>
                    {isStale && (
                      <>
                        <span className="text-slate-700 text-xs">·</span>
                        <span className="text-xs text-orange-400/80">Sin seguimiento +5d</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Días / Estado */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-xs text-slate-500 font-mono hidden sm:inline">{item.expiration_date}</span>
                  <span className={`text-sm font-bold tabular-nums ${
                    status === 'Vencido' ? 'text-rose-400' : 'text-amber-300'
                  }`}>
                    {status === 'Vencido' ? 'Vencido' : `${days}d`}
                  </span>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </div>
            )
          })}
        </div>

        {/* ===== "VER MÁS" si hay más de 5 ===== */}
        {expiringItems.length > 5 && (
          <button
            onClick={() => { setStatsModal('expiring'); setModalSearch('') }}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/[0.04] transition-all border-t border-amber-500/10"
          >
            Ver las {expiringItems.length} alertas
            <ChevronRight size={14} />
          </button>
        )}
      </>
    )}
  </div>
)}
            {loading ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 animate-pulse">
                      <div className="h-3 bg-slate-800 rounded w-1/2 mb-3" />
                      <div className="h-6 bg-slate-800 rounded w-1/3" />
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 animate-pulse">
                  <div className="h-6 bg-slate-800 rounded w-1/4 mb-4" />
                  <div className="h-32 bg-slate-800 rounded" />
                </div>
              </div>
            ) : !currentClient ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-12 text-center">
                <Monitor size={48} className="mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Selecciona un cliente para ver sus servicios</p>
              </div>
            ) : (
              <>
                {/* Client stats */}
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
                    <p className="text-xs text-slate-400">Servicios</p>
                    <p className="mt-2 text-2xl font-bold">{currentClient.summary.services}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
                    <p className="text-xs text-slate-400">Licencias</p>
                    <p className="mt-2 text-2xl font-bold">{currentClient.summary.licenses}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-xs text-amber-200">Próximos a vencer</p>
                    <p className="mt-2 text-2xl font-bold text-amber-200">{currentClient.summary.expiring}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                    <p className="text-xs text-rose-200">Críticos</p>
                    <p className="mt-2 text-2xl font-bold text-rose-200">{currentClient.summary.critical}</p>
                  </div>
                </div>


                {/* Client sections */}
                <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h2 className="text-3xl font-bold">{currentClient.name}</h2>
                      <p className="mt-1 text-slate-400">Vista completa de servicios y accesos del cliente</p>
                    </div>
                    <StatusPill status={currentClient.summary.critical > 0 ? 'Vencido' : currentClient.summary.expiring > 0 ? 'Próximo' : 'OK'} />
                  </div>

                  <div className="space-y-5">
                    {currentClient.sections.map((section, idx) => (
                      <SectionCard
                        key={selectedClientId + '-' + section.title}
                        section={section}
                        defaultOpen={openSections.has(section.title)}
                        highlightedItemId={highlightedItemId}
                        isAdmin={userRole === 'admin'}
                        onEdit={item => { setEditItem(item); setModalOpen(true) }}
                        onDelete={id => setDeleteConfirm(id)}
                        onDuplicate={duplicateItem}
                        onHistory={fetchHistory}
                      />
                    ))}
                    {currentClient.sections.length === 0 && (
                      <div className="text-center py-12 text-slate-500">
                        <Server size={32} className="mx-auto mb-3 opacity-30" />
                        <p>Este cliente no tiene registros</p>
                        <button
                          onClick={() => { setEditItem(null); setModalOpen(true) }}
                          className="mt-3 inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          <Plus size={14} /> Agregar primer registro
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ItemModal
          item={editItem}
          clients={clients}
          categories={categories}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          onSaved={() => { setModalOpen(false); setEditItem(null); fetchData() }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle size={24} />
              <h3 className="font-semibold text-lg">Confirmar eliminación</h3>
            </div>
            <p className="text-slate-400 text-sm">
              {deleteConfirm.startsWith('client:')
                ? 'Al eliminar el cliente también se eliminarán todos sus registros asociados. Esta acción no se puede deshacer.'
                : 'Esta acción no se puede deshacer. El registro será eliminado permanentemente.'}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.startsWith('client:')) {
                    handleDeleteClient(deleteConfirm.replace('client:', ''))
                  } else {
                    handleDelete(deleteConfirm)
                  }
                }}
                className="bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-xl text-sm transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Name Modal */}
      {editClientId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setEditClientId(null); setEditClientName('') }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-cyan-400">
              <Pencil size={24} />
              <h3 className="font-semibold text-lg">Editar nombre del cliente</h3>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Nombre del cliente</label>
              <input
                type="text"
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveClientName() }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-500 outline-none transition-colors"
                placeholder="Nombre del cliente"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditClientId(null); setEditClientName('') }}
                className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClientName}
                disabled={!editClientName.trim() || savingClient}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm transition-all"
              >
                {savingClient ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* History Modal */}
      {historyItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHistoryItem(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <History size={16} className="text-cyan-400" />
                <h3 className="font-semibold">Historial — {historyItem.name}</h3>
              </div>
              <button onClick={() => setHistoryItem(null)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
              ) : history.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Sin historial de cambios aún</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-800/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-cyan-300">{h.user_email}</span>
                      <span className="text-xs text-slate-500">{new Date(h.changed_at).toLocaleString()}</span>
                    </div>
                    {Object.entries(h.changes as Record<string, {from: unknown; to: unknown}>).map(([field, val]) => (
                      <div key={field} className="text-xs text-slate-400">
                        <span className="text-slate-300 font-medium">{field}:</span>{' '}
                        <span className="text-rose-400 line-through">{String(val.from) || '—'}</span>
                        {' → '}
                        <span className="text-emerald-400">{String(val.to) || '—'}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Roles Modal */}
      {rolesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRolesModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-cyan-400" />
                <h3 className="font-semibold">Gestión de roles</h3>
              </div>
              <button onClick={() => setRolesModal(false)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newRoleEmail}
                  onChange={e => setNewRoleEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none"
                />
                <select
                  value={newRoleValue}
                  onChange={e => setNewRoleValue(e.target.value as 'admin' | 'viewer')}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button onClick={saveRole} className="bg-cyan-600 hover:bg-cyan-500 px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap">
                  + Agregar
                </button>
              </div>
              {allRoles.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">No hay roles configurados</p>
              ) : (
                allRoles.map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{r.user_email}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.role === 'admin' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-700 text-slate-400'}`}>{r.role}</span>
                    </div>
                    {r.user_email !== user?.email && (
                      <button onClick={() => deleteRole(r.user_email)} className="text-slate-500 hover:text-rose-400 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-rose-500/10">
                        Eliminar
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* Stats Detail Modal */}
      {statsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setStatsModal(null); setModalSearch('') }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <h3 className="font-semibold text-lg">
                {statsModal === 'clients' && `Clientes (${globalStats.clients})`}
                {statsModal === 'total' && `Todos los items (${globalStats.total})`}
                {statsModal === 'expiring' && `Próximos a vencer (${globalStats.expiring})`}
                {statsModal === 'critical' && `Críticos / Vencidos (${globalStats.critical})`}
              </h3>
              <button onClick={() => { setStatsModal(null); setModalSearch('') }} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2">
                <Search size={14} className="text-slate-400 flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                />
                {modalSearch && (
                  <button onClick={() => setModalSearch('')} className="text-slate-500 hover:text-white">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {statsModal === 'clients' ? (
                (clients as ClientWithItems[]).filter(c => !modalSearch || c.name.toLowerCase().includes(modalSearch.toLowerCase())).map(c => {
                  const cItems = allItems.filter(i => i.client_id === c.id)
                  const expiring = cItems.filter(i => getItemStatus(i.expiration_date) === 'Próximo').length
                  const critical = cItems.filter(i => getItemStatus(i.expiration_date) === 'Vencido').length
                  return (
                    <button key={c.id} onClick={() => { setSelectedClientId(c.id); setStatsModal(null); setModalSearch('') }} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-3 hover:border-slate-600 hover:bg-slate-700/50 transition-all text-left">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-slate-400">{cItems.length} items</p>
                      </div>
                      <div className="flex gap-2">
                        {critical > 0 && <span className="rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs px-2 py-0.5">{critical} vencidos</span>}
                        {expiring > 0 && <span className="rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-2 py-0.5">{expiring} próximos</span>}
                        {critical === 0 && expiring === 0 && <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs px-2 py-0.5">OK</span>}
                      </div>
                    </button>
                  )
                })
              ) : (
                statsModalItems.filter(item => { const cn = (clients as ClientWithItems[]).find(c => c.id === item.client_id)?.name ?? ''; return !modalSearch || item.name.toLowerCase().includes(modalSearch.toLowerCase()) || cn.toLowerCase().includes(modalSearch.toLowerCase()) }).map(item => {
                  const clientName = (clients as ClientWithItems[]).find(c => c.id === item.client_id)?.name ?? '—'
                  const days = getDaysUntilExpiration(item.expiration_date)
                  const status = getItemStatus(item.expiration_date)
                  return (
                    <button key={item.id} onClick={() => { setSelectedClientId(item.client_id ?? null); setStatsModal(null); setModalSearch('') }} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-3 hover:border-slate-600 hover:bg-slate-700/50 transition-all text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{clientName} · {item.category}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                        {item.expiration_date && days !== null && (
                          <span className="text-xs text-slate-400">
                            {days < 0 ? `Vencido hace ${Math.abs(days)}d` : `${days}d`}
                          </span>
                        )}
                        <StatusPill status={status} />
                      </div>
                    </button>
                  )
                })
              )}
              {statsModal !== 'clients' && statsModalItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <CheckCircle size={32} className="mb-2 text-emerald-500" />
                  <p className="text-sm">No hay items en esta categoría</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
