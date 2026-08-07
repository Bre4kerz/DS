import { Fragment, Suspense, lazy, useEffect, useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import logoImg from '../assets/logo1.png'
import {
  ChevronDown, ChevronRight, Search, Plus, RefreshCw, X,
  Server, HardDrive, Wifi, Printer, Shield, BadgeCheck, Globe, KeyRound,
  AlertTriangle, CheckCircle, Calendar, Monitor, Pencil, Trash2,
  Eye, EyeOff, Copy, Lock, LogOut, History, Copy as CopyIcon, Users, ClipboardList,
  Moon, Sun, ArrowUpDown, Send
} from 'lucide-react'
import {
  supabase, CmdbClient, CmdbItem, getItemStatus, getDaysUntilExpiration,
  ClientSummary, SectionData,
  hasCredentials, revealCredentials, Credentials
} from '../lib/supabase'
import ItemModal from './ItemModal'
import { CMDB_PERMISSION_KEYS, useCmdbData, type CmdbPermission } from '../hooks/useCmdbData'

const DataTransferModal = lazy(() => import('./DataTransferModal'))

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

type DashboardNavigationState = {
  selectedClientId: string | null
  openSections: string[]
  categoryFilter: string
  alertThreshold: number
  alertStatus: string
  alertsExpanded: boolean
}

type ThemeMode = 'dark' | 'light'
type CmdbRole = 'superuser' | 'admin' | 'viewer'

const PERMISSION_LABELS: Record<CmdbPermission, string> = {
  'records.view': 'View records',
  'records.create': 'Create records',
  'records.edit': 'Edit records',
  'records.delete': 'Delete records',
  'credentials.view': 'View credentials',
  'credentials.edit': 'Edit credentials',
  'history.view': 'View history',
  'alerts.view': 'View alerts',
  'alerts.configure': 'Configure alerts',
  'quality.view': 'View data quality',
  'quality.configure': 'Configure quality rules',
  'audit.view': 'View audit logs',
  'roles.manage': 'Manage roles',
  'permissions.manage': 'Manage permissions',
  'data.transfer': 'Import / export data',
}

const PERMISSION_TEMPLATES: Record<string, CmdbPermission[]> = {
  Viewer: ['records.view', 'history.view', 'alerts.view', 'quality.view'],
  Support: ['records.view', 'records.create', 'records.edit', 'credentials.view', 'history.view', 'alerts.view', 'quality.view'],
  Renewals: ['records.view', 'records.edit', 'history.view', 'alerts.view', 'quality.view', 'data.transfer'],
  Auditor: ['records.view', 'history.view', 'alerts.view', 'quality.view', 'audit.view', 'data.transfer'],
  Admin: CMDB_PERMISSION_KEYS.filter(permission => permission !== 'permissions.manage'),
}

const getDashboardStateKey = (userId: string) => `cmdb-dashboard-state:${userId}`

function ThemeToggle({ userId }: { userId: string }) {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem(`cmdb-theme:${userId}`) === 'light' ? 'light' : 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(`cmdb-theme:${userId}`, theme)
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [theme, userId])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'light'}
      aria-label={theme === 'dark' ? 'Activate light mode' : 'Activate dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
      className="relative flex h-9 w-[68px] items-center rounded-full border border-slate-700 bg-slate-900 px-1 transition-colors"
    >
      <Moon size={13} className={`absolute left-2 transition-opacity ${theme === 'dark' ? 'opacity-100 text-cyan-300' : 'opacity-40 text-slate-500'}`} />
      <Sun size={13} className={`absolute right-2 transition-opacity ${theme === 'light' ? 'opacity-100 text-amber-500' : 'opacity-40 text-slate-500'}`} />
      <span
        className={`h-7 w-7 rounded-full shadow-md transition-transform duration-200 ${
          theme === 'light'
            ? 'translate-x-[31px] bg-amber-400'
            : 'translate-x-0 bg-cyan-600'
        }`}
      />
    </button>
  )
}

const readDashboardNavigationState = (userId?: string): DashboardNavigationState | null => {
  if (!userId) return null
  try {
    const stored = localStorage.getItem(getDashboardStateKey(userId))
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<DashboardNavigationState>
    return {
      selectedClientId: typeof parsed.selectedClientId === 'string' ? parsed.selectedClientId : null,
      openSections: Array.isArray(parsed.openSections)
        ? parsed.openSections.filter((section): section is string => typeof section === 'string')
        : [],
      categoryFilter: typeof parsed.categoryFilter === 'string' ? parsed.categoryFilter : 'All',
      alertThreshold: typeof parsed.alertThreshold === 'number' ? parsed.alertThreshold : 365,
      alertStatus: typeof parsed.alertStatus === 'string' ? parsed.alertStatus : 'All',
      alertsExpanded: typeof parsed.alertsExpanded === 'boolean' ? parsed.alertsExpanded : true,
    }
  } catch {
    return null
  }
}

function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    'OK': 'OK',
    'Expiring': 'Expiring',
    'Expired': 'Expired',
    'No date': 'No date',
    'Not required': 'Not required',
  }
  const styles: Record<string, string> = {
    'OK': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Expiring': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Expired': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    'No date': 'bg-slate-700 text-slate-300 border-slate-600',
    'Not required': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles['No date']}`}>
      {label[status] || status}
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
            title={show ? 'Hide' : 'Show'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={copyValue}
            disabled={!value}
            className={`rounded-lg p-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              copied ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700'
            }`}
            title={copied ? 'Copied' : 'Copy'}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

type QualityIssue = {
  id: string
  item_id: string | null
  issue_code: string
  severity: 'critical' | 'error' | 'warning'
  field_name: string | null
  message: string
  last_detected_at: string
  resolved_at: string | null
}

type AuditLog = {
  id: number
  occurred_at: string
  actor_email: string | null
  event_type: 'authentication' | 'data_change' | 'security'
  action: string
  entity_type: string | null
  entity_id: string | null
  entity_name: string | null
  summary: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

type ExpirationNotification = {
  id: number
  item_id: string
  expiration_date: string
  threshold_days: number
  recipient: string
  status: 'sent' | 'failed'
  error: string | null
  sent_at: string
}

type QualityRule = {
  issue_code: string
  label: string
  enabled: boolean
  severity: 'critical' | 'error' | 'warning'
}

function CopyableValue({ value, label = 'IP' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copyIp = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!value) return <span className="text-slate-600">—</span>

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-cyan-400/80 text-[11px] truncate">{value}</span>
      <button
        type="button"
        onClick={copyIp}
        className={`rounded-md p-1 transition-colors ${
          copied
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'text-slate-600 hover:bg-slate-700 hover:text-cyan-300'
        }`}
        title={copied ? 'Copied' : `Copy ${label}`}
        aria-label={copied ? `${label} copied` : `Copy ${label} ${value}`}
      >
        {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
      </button>
    </div>
  )
}

function SensitiveCopyableValue({ value, label }: { value: string; label: string }) {
  const [revealed, setRevealed] = useState(false)

  if (!value) return <span className="text-slate-600">—</span>

  return (
    <div className="flex items-center gap-1.5">
      {revealed ? (
        <CopyableValue value={value} label={label} />
      ) : (
        <span className="font-mono text-[11px] tracking-wider text-slate-500">••••••••</span>
      )}
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          setRevealed(current => !current)
        }}
        className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-700 hover:text-cyan-300"
        title={revealed ? `Hide ${label}` : `Reveal ${label}`}
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  )
}

function SecureCredentialsPanel({ itemId }: { itemId: string }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    revealCredentials(itemId)
      .then(data => {
        if (active) setCredentials(data)
      })
      .catch(fetchError => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not reveal credentials')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [itemId])

  if (loading) return <p className="text-xs text-slate-500">Loading credentials…</p>
  if (error) return <p className="text-xs text-rose-400">{error}</p>
  if (!credentials) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CredentialField label="User" value={credentials.user} />
      <CredentialField label="Password" value={credentials.password} />
      <CredentialField label="User alt." value={credentials.user_alt} />
      <CredentialField label="Password alt." value={credentials.password_alt} />
    </div>
  )
}

function SectionCard({ section, defaultOpen = false, canCreate = false, canEdit = false, canDelete = false, canViewCredentials = false, canViewHistory = false, highlightedItemId, onOpenChange, onAdd, onEdit, onDelete, onDuplicate, onHistory }: {
  section: SectionData
  defaultOpen?: boolean
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  canViewCredentials?: boolean
  canViewHistory?: boolean
  highlightedItemId?: string | null
  onOpenChange: (category: string, open: boolean) => void
  onAdd: (category: string) => void
  onEdit: (item: CmdbItem) => void
  onDelete: (id: string) => void
  onDuplicate: (item: CmdbItem) => void
  onHistory: (item: CmdbItem) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'type-asc' | 'type-desc'>('name-asc')
  const icon = CATEGORY_ICONS[section.title] || <Server size={18} />
  const isLicenseSection = section.title === 'Licenses'
  const hasExpiring = section.rows.some(r => r.status === 'Expiring' || r.status === 'Expired')
  const hasCreds = canViewCredentials && section.rows.some(r => hasCredentials(r.item))

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

  const toggleSection = () => {
    setOpen(current => {
      const next = !current
      onOpenChange(section.title, next)
      return next
    })
  }

  useEffect(() => {
    if (highlightedItemId && section.rows.some(r => r.id === highlightedItemId)) {
      setOpen(true)
    }
  }, [highlightedItemId, section.rows])

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <div className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
      hasExpiring ? 'border-amber-500/20 shadow-lg shadow-amber-500/5' : 'border-slate-800/60'
    } bg-[#0a1220]`}>

      <div className="flex w-full items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-800/30">
        <button onClick={toggleSection} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <div className="flex items-center gap-3.5">
          <div className={`rounded-xl p-2.5 ${
            hasExpiring ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-300'
          }`}>
            {icon}
          </div>
          <div className="text-left">
            <h3 className="text-[15px] font-semibold text-white tracking-tight">{section.title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {section.rows.length} records
              {hasCreds && ` · ${section.rows.filter(r => hasCredentials(r.item)).length} with credentials`}
            </p>
          </div>
        </div>
        </button>

        <div className="flex items-center gap-3">
          {hasExpiring && (
            <span className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <AlertTriangle size={11} />
              Check expirations
            </span>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={() => onAdd(section.title)}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              title={`Add record to ${section.title}`}
            >
              <Plus size={13} />
              <span className="hidden sm:inline">Add</span>
            </button>
          )}
          <button type="button" onClick={toggleSection} className="rounded-lg p-1 hover:bg-slate-700/50" aria-label={open ? `Collapse ${section.title}` : `Expand ${section.title}`}>
            {open ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800/60">

          <div className="flex items-center justify-between px-5 py-2.5 bg-slate-950/30">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
              Detalle de records
            </p>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1 text-[11px] text-slate-400 outline-none cursor-pointer hover:border-slate-600 transition-colors"
            >
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="type-asc">Type A-Z</option>
              <option value="type-desc">Type Z-A</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium w-10"></th>
                  <th className="px-3 py-2.5 text-left font-medium">Type</th>
                  <th className="px-3 py-2.5 text-left font-medium">Name</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">{isLicenseSection ? 'Vendor' : 'Domain / Version'}</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">{isLicenseSection ? 'Branch' : 'Usage / Roles'}</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">{isLicenseSection ? 'Serial / License' : 'IP / ID'}</th>
                  <th className="w-32 whitespace-nowrap px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const isExpanded = expandedRows.has(row.id)
                  const creds = canViewCredentials && hasCredentials(row.item)
                  const isHighlighted = highlightedItemId === row.id

                  return (
                    <Fragment key={row.id}>
                      <tr
                        id={'item-' + row.id}
                        onClick={() => {
                          if (creds) toggleRow(row.id)
                        }}
                        onKeyDown={event => {
                          if (creds && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault()
                            toggleRow(row.id)
                          }
                        }}
                        tabIndex={creds ? 0 : undefined}
                        className={`border-b border-slate-800/40 transition-[background-color,border-color,box-shadow] duration-200 ${
                          isHighlighted
                            ? 'bg-cyan-500/15 border-l-2 border-l-cyan-400/60 glow-row'
                            : idx % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/20'
                        } hover:bg-slate-800/30 ${creds ? 'cursor-pointer focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/40' : ''}`}
                      >
                        <td className="px-5 py-3">
                          {creds ? (
                            <button
                              onClick={event => {
                                event.stopPropagation()
                                toggleRow(row.id)
                              }}
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
                            {isLicenseSection && (
                              <p className="text-[10px] text-cyan-500/70 mt-0.5 truncate max-w-[220px]">
                                QTY: {row.item.qty ?? 1}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-slate-400 text-[12px]">{isLicenseSection ? row.item.vendor || '—' : row.domain || '—'}</span>
                        </td>

                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-slate-500 text-[11px]">{isLicenseSection ? row.item.branch || '—' : row.role || '—'}</span>
                        </td>

                        <td className="px-3 py-3 hidden sm:table-cell">
                          {isLicenseSection ? (
                            <SensitiveCopyableValue value={row.item.serial ?? ''} label="serial or license" />
                          ) : (
                            <CopyableValue value={row.ip} label="IP" />
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <StatusPill status={row.status} />
                        </td>

                        <td className="px-5 py-3">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={event => event.stopPropagation()}
                          >
                            {canViewHistory && (
                              <button
                                onClick={() => onHistory(row.item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700/60 transition-all"
                                title="History"
                              >
                                <History size={13} />
                              </button>
                            )}
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => onDuplicate(row.item)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                                  title="Duplicate"
                                >
                                  <CopyIcon size={13} />
                                </button>
                                <button
                                  onClick={() => onEdit(row.item)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-blue-500/20 transition-all"
                                  title="Edit"
                                >
                                  <Pencil size={13} />
                                </button>
                                {canDelete && (
                                  <button
                                    onClick={() => onDelete(row.id)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                                    title="Delete"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
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
                                <h4 className="text-[11px] font-semibold text-yellow-300/90 uppercase tracking-wider">Credentials</h4>
                              </div>
                              <SecureCredentialsPanel itemId={row.item.id} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sortedRows.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Server size={24} className="mx-auto mb-2 opacity-30" />
              No hay records en esta sección
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isProcessStale(item: CmdbItem, staleDays = 5): boolean {
  const status = getItemStatus(item.expiration_date)
  if (status === 'OK' || status === 'No date') return false
  if (!item.process || item.process === '') return false
  if (!item.process_updated_at) return false
  const updated = new Date(item.process_updated_at)
  const now = new Date()
  const diff = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= staleDays
}

export default function DashboardCMDB() {
  const { user, signOut } = useAuth()
  const restoredNavigation = useMemo(
    () => readDashboardNavigationState(user?.id),
    [user?.id],
  )
  const {
    clients,
    allItems,
    loading,
    refreshing,
    userRole,
    hasPermission,
    history,
    loadingHistory,
    allRoles,
    fetchData,
    handleDelete: deleteItem,
    handleDeleteClient: deleteClient,
    handleEditClient: updateClient,
    fetchHistory: loadHistory,
    fetchRoles: loadRoles,
    saveRole: upsertRole,
    deleteRole: removeRole,
  } = useCmdbData(user)
  const [search, setSearch] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(restoredNavigation?.openSections ?? []),
  )
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    restoredNavigation?.selectedClientId ?? null,
  )
  const [statsModal, setStatsModal] = useState<null | 'clients' | 'total' | 'expiring' | 'critical' | 'alerts'>(null)
  const [modalSearch, setModalSearch] = useState('')
  const [alertThreshold, setAlertThreshold] = useState<number>(restoredNavigation?.alertThreshold ?? 365)
  const [alertsExpanded, setAlertsExpanded] = useState(restoredNavigation?.alertsExpanded ?? true)
  const [alertStatus, setAlertStatus] = useState(restoredNavigation?.alertStatus ?? 'All')
  const [categoryFilter, setCategoryFilter] = useState<string>(restoredNavigation?.categoryFilter ?? 'All')
  const [historyItem, setHistoryItem] = useState<CmdbItem | null>(null)
  const [rolesModal, setRolesModal] = useState(false)
  const [dataTransferModal, setDataTransferModal] = useState(false)
  const [rolePermissions, setRolePermissions] = useState<Record<string, Set<CmdbPermission>>>({})
  const [roleCategoryAccess, setRoleCategoryAccess] = useState<Record<string, Record<string, { view: boolean; edit: boolean }>>>({})
  const [auditLogsModal, setAuditLogsModal] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)
  const [auditLogsError, setAuditLogsError] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditEventFilter, setAuditEventFilter] = useState('all')
  const [expandedAuditLogId, setExpandedAuditLogId] = useState<number | null>(null)
  const [alertSettingsModal, setAlertSettingsModal] = useState(false)
  const [qualityIssuesModal, setQualityIssuesModal] = useState(false)
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([])
  const [qualitySearch, setQualitySearch] = useState('')
  const [qualitySeverity, setQualitySeverity] = useState('all')
  const [qualityRules, setQualityRules] = useState<QualityRule[]>([])
  const [savingQualityRule, setSavingQualityRule] = useState<string | null>(null)
  const [qualityRuleError, setQualityRuleError] = useState('')
  const [notificationHistoryModal, setNotificationHistoryModal] = useState(false)
  const [notifications, setNotifications] = useState<ExpirationNotification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [alertSettings, setAlertSettings] = useState({
    enabled: false,
    thresholds: '90, 60, 30, 15, 7, 1, 0',
    recipients: '',
    from_email: '',
  })
  const [savingAlertSettings, setSavingAlertSettings] = useState(false)
  const [sendingAlertsNow, setSendingAlertsNow] = useState(false)
  const [alertSettingsMessage, setAlertSettingsMessage] = useState('')
  const [newRoleEmail, setNewRoleEmail] = useState('')
  const [newRoleValue, setNewRoleValue] = useState<CmdbRole>('viewer')
  const [roleError, setRoleError] = useState('')
  const [savingRoleEmail, setSavingRoleEmail] = useState<string | null>(null)
  const [pendingRoleAction, setPendingRoleAction] = useState<
    | { type: 'change'; email: string; role: CmdbRole }
    | { type: 'delete'; email: string }
    | null
  >(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CmdbItem | null>(null)
  const [newItemDefaults, setNewItemDefaults] = useState<{ clientId: string; category: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [savingClient, setSavingClient] = useState(false)

  useEffect(() => {
    if (clients.length > 0 && (!selectedClientId || !clients.some(client => client.id === selectedClientId))) {
      setSelectedClientId(clients[0].id)
    }
  }, [clients, selectedClientId])

  useEffect(() => {
    if (!user?.id) return
    const navigationState: DashboardNavigationState = {
      selectedClientId,
      openSections: [...openSections],
      categoryFilter,
      alertThreshold,
      alertStatus,
      alertsExpanded,
    }
    localStorage.setItem(getDashboardStateKey(user.id), JSON.stringify(navigationState))
  }, [
    user?.id,
    selectedClientId,
    openSections,
    categoryFilter,
    alertThreshold,
    alertStatus,
    alertsExpanded,
  ])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q.length < 2) return []
    const matchingItems = allItems.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.ip?.toLowerCase().includes(q) ||
      i.serial?.toLowerCase().includes(q) ||
      i.domain_version?.toLowerCase().includes(q) ||
      i.vendor?.toLowerCase().includes(q) ||
      i.branch?.toLowerCase().includes(q)
    )
    const results: Array<{ item: CmdbItem; client: CmdbClient | undefined }> = []
    for (const i of matchingItems) {
      results.push({ item: i, client: clients.find(c => c.id === i.client_id) })
    }
    return results.slice(0, 10)
  }, [search, allItems, clients])

  const matchingClientResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return clients.filter(client => client.name.toLowerCase().includes(q))
  }, [search, clients])

  const allCategories = useMemo(() => {
    const cats = new Set(allItems.map(i => i.category).filter(Boolean))
    return ['All', ...Array.from(cats).sort()]
  }, [allItems])

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter(c => {
      if (categoryFilter !== 'All') {
        const hasCategory = c.items.some(i => i.category === categoryFilter)
        if (!hasCategory) return false
      }
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.items.some(i =>
          i.name.toLowerCase().includes(q) ||
          i.ip?.toLowerCase().includes(q) ||
          i.email?.toLowerCase().includes(q) ||
          i.vendor?.toLowerCase().includes(q) ||
          i.branch?.toLowerCase().includes(q)
        )
      )
    })
  }, [clients, search, categoryFilter])

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

  const duplicateItem = async (item: CmdbItem) => {
    const rest: Partial<CmdbItem> = { ...item }
    delete rest.id
    delete rest.created_at
    delete rest.updated_at
    delete rest.cmdb_clients
    const { data, error } = await supabase
      .from('cmdb_items')
      .insert({
        ...rest,
        name: rest.name + ' (copia)',
        has_credentials: false,
        updated_at: new Date().toISOString(),
      })
      .select('id, client_id, category')
      .single()
    if (error) {
      console.error('Error duplicando item:', error)
      return
    }
    await fetchData(false)
    highlightSavedItem(data as { id: string; client_id: string; category: string })
  }

  const fetchHistory = async (item: CmdbItem) => {
    setHistoryItem(item)
    await loadHistory(item)
  }

  const fetchRoles = async () => {
    const roles = await loadRoles()
    if (hasPermission('permissions.manage') && roles.length > 0) {
      const { data } = await supabase
        .from('cmdb_user_permissions')
        .select('role_id,permission_key,allowed')
        .in('role_id', roles.map(role => role.id))
      const next: Record<string, Set<CmdbPermission>> = {}
      for (const role of roles) {
        const defaults = role.role === 'superuser'
          ? CMDB_PERMISSION_KEYS
          : role.role === 'admin'
            ? CMDB_PERMISSION_KEYS.filter(permission => permission !== 'permissions.manage')
            : ['records.view', 'history.view', 'alerts.view', 'quality.view'] as CmdbPermission[]
        next[role.id] = new Set(defaults)
      }
      for (const row of data ?? []) {
        const permission = row.permission_key as CmdbPermission
        if (row.allowed) next[row.role_id]?.add(permission)
        else next[row.role_id]?.delete(permission)
      }
      setRolePermissions(next)

      const { data: categoryRows } = await supabase
        .from('cmdb_user_category_access')
        .select('role_id,category,can_view,can_edit')
        .in('role_id', roles.map(role => role.id))
      const categoryAccess: Record<string, Record<string, { view: boolean; edit: boolean }>> = {}
      for (const row of categoryRows ?? []) {
        categoryAccess[row.role_id] ??= {}
        categoryAccess[row.role_id][row.category] = { view: row.can_view, edit: row.can_edit }
      }
      setRoleCategoryAccess(categoryAccess)
    }
    setRolesModal(true)
  }

  const toggleRolePermission = async (roleId: string, permission: CmdbPermission, allowed: boolean) => {
    setRoleError('')
    const previous = rolePermissions[roleId] ?? new Set<CmdbPermission>()
    setRolePermissions(current => ({
      ...current,
      [roleId]: new Set(
        allowed ? [...previous, permission] : [...previous].filter(value => value !== permission),
      ),
    }))
    const { error } = await supabase.from('cmdb_user_permissions').upsert({
      role_id: roleId,
      permission_key: permission,
      allowed,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }, { onConflict: 'role_id,permission_key' })
    if (error) {
      setRoleError(error.message)
      await fetchRoles()
    }
  }

  const applyPermissionTemplate = async (roleId: string, templateName: string) => {
    const selected = new Set(PERMISSION_TEMPLATES[templateName] ?? [])
    setRoleError('')
    setRolePermissions(current => ({ ...current, [roleId]: selected }))
    const { error } = await supabase.from('cmdb_user_permissions').upsert(
      CMDB_PERMISSION_KEYS.map(permission => ({
        role_id: roleId,
        permission_key: permission,
        allowed: selected.has(permission),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })),
      { onConflict: 'role_id,permission_key' },
    )
    if (error) {
      setRoleError(error.message)
      await fetchRoles()
    }
  }

  const toggleCategoryAccess = async (
    roleId: string,
    category: string,
    field: 'view' | 'edit',
    allowed: boolean,
  ) => {
    const role = allRoles.find(candidate => candidate.id === roleId)
    if (!role) return
    const current = roleCategoryAccess[roleId] ?? {}
    const defaultEdit = rolePermissions[roleId]?.has('records.edit') ?? role.role === 'admin'
    const next = Object.fromEntries(categories.map(name => [
      name,
      current[name] ?? { view: true, edit: defaultEdit },
    ]))
    next[category] = {
      ...next[category],
      [field]: allowed,
      ...(field === 'view' && !allowed ? { edit: false } : {}),
    }
    setRoleCategoryAccess(value => ({ ...value, [roleId]: next }))
    const { error } = await supabase.from('cmdb_user_category_access').upsert(
      Object.entries(next).map(([name, access]) => ({
        role_id: roleId,
        category: name,
        can_view: access.view,
        can_edit: access.edit,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })),
      { onConflict: 'role_id,category' },
    )
    if (error) {
      setRoleError(error.message)
      await fetchRoles()
    }
  }

  const fetchAuditLogs = async () => {
    setAuditLogsModal(true)
    setLoadingAuditLogs(true)
    setAuditLogsError('')
    const { data, error } = await supabase
      .from('cmdb_audit_logs')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(500)
    if (error) {
      console.error('Could not load audit logs:', error)
      setAuditLogsError(error.message)
      setAuditLogs([])
    } else {
      setAuditLogs((data ?? []) as AuditLog[])
    }
    setLoadingAuditLogs(false)
  }

  const fetchQualityIssues = async (openModal = false) => {
    const [{ data }, { data: rules }] = await Promise.all([
      supabase.from('cmdb_data_quality_issues')
        .select('*').is('resolved_at', null).order('last_detected_at', { ascending: false }),
      supabase.from('cmdb_quality_rule_settings').select('*').order('severity'),
    ])
    setQualityIssues((data ?? []) as QualityIssue[])
    setQualityRules((rules ?? []) as QualityRule[])
    if (openModal) setQualityIssuesModal(true)
  }

  const toggleQualityRule = async (rule: QualityRule) => {
    if (savingQualityRule) return
    const enabled = !rule.enabled
    setSavingQualityRule(rule.issue_code)
    setQualityRuleError('')
    setQualityRules(current => current.map(candidate =>
      candidate.issue_code === rule.issue_code ? { ...candidate, enabled } : candidate,
    ))
    const { error } = await supabase.from('cmdb_quality_rule_settings').update({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq('issue_code', rule.issue_code)
    if (error) {
      setQualityRuleError(error.message)
      await fetchQualityIssues()
    }
    setSavingQualityRule(null)
  }

  const fetchNotificationHistory = async () => {
    setNotificationHistoryModal(true)
    setLoadingNotifications(true)
    const { data } = await supabase.from('cmdb_expiration_notifications')
      .select('*').order('sent_at', { ascending: false }).limit(500)
    setNotifications((data ?? []) as ExpirationNotification[])
    setLoadingNotifications(false)
  }

  const queueNotificationRetry = async (notificationId: number) => {
    const { error } = await supabase.rpc('queue_cmdb_notification_retry', {
      p_notification_id: notificationId,
    })
    if (error) {
      console.error('Could not queue notification retry:', error)
      return
    }
    setNotifications(current => current.filter(notification => notification.id !== notificationId))
  }

  const openAlertSettings = async () => {
    setAlertSettingsMessage('')
    const { data, error } = await supabase.from('cmdb_alert_settings').select('*').eq('id', true).single()
    if (error) {
      setAlertSettingsMessage(error.message)
    } else if (data) {
      setAlertSettings({
        enabled: data.enabled,
        thresholds: (data.thresholds ?? []).join(', '),
        recipients: (data.recipients ?? []).join('\n'),
        from_email: data.from_email ?? '',
      })
    }
    setAlertSettingsModal(true)
  }

  const saveAlertSettings = async () => {
    const thresholds = [...new Set(
      alertSettings.thresholds.split(',').map(value => Number.parseInt(value.trim(), 10)).filter(Number.isFinite)
    )].sort((a, b) => b - a)
    const recipients = [...new Set(
      alertSettings.recipients.split(/[\n,;]/).map(value => value.trim().toLowerCase()).filter(Boolean)
    )]
    if (thresholds.length === 0) {
      setAlertSettingsMessage('Add at least one valid threshold.')
      return
    }
    if (alertSettings.enabled && (!alertSettings.from_email.trim() || recipients.length === 0)) {
      setAlertSettingsMessage('Sender and at least one recipient are required when alerts are enabled.')
      return
    }
    setSavingAlertSettings(true)
    setAlertSettingsMessage('')
    const { error } = await supabase.from('cmdb_alert_settings').update({
      enabled: alertSettings.enabled,
      thresholds,
      recipients,
      from_email: alertSettings.from_email.trim(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq('id', true)
    setAlertSettingsMessage(error ? error.message : 'Settings saved.')
    setSavingAlertSettings(false)
  }

  const sendAlertsNow = async () => {
    if (sendingAlertsNow) return
    setSendingAlertsNow(true)
    setAlertSettingsMessage('')
    const { data, error } = await supabase.functions.invoke('send-expiration-alerts', {
      body: { source: 'manual' },
    })
    if (error) {
      setAlertSettingsMessage(`Could not send alerts: ${error.message}`)
    } else {
      const result = data as { sent?: number; failed?: number } | null
      const sent = result?.sent ?? 0
      const failed = result?.failed ?? 0
      setAlertSettingsMessage(
        sent === 0 && failed === 0
          ? 'No new notifications to send.'
          : `Send complete: ${sent} notification(s) sent${failed ? `, ${failed} failed` : ''}.`,
      )
    }
    setSendingAlertsNow(false)
  }

  const saveRole = async () => {
    if (!newRoleEmail.trim()) return
    setRoleError('')
    setSavingRoleEmail(newRoleEmail.trim())
    try {
      await upsertRole(newRoleEmail.trim(), newRoleValue)
      setNewRoleEmail('')
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Could not save the role')
    } finally {
      setSavingRoleEmail(null)
    }
  }

  const deleteRole = async (email: string) => {
    setRoleError('')
    setSavingRoleEmail(email)
    try {
      await removeRole(email)
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Could not delete the role')
    } finally {
      setSavingRoleEmail(null)
    }
  }

  const changeRole = async (email: string, role: CmdbRole) => {
    setRoleError('')
    setSavingRoleEmail(email)
    try {
      await upsertRole(email, role)
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Could not change the role')
    } finally {
      setSavingRoleEmail(null)
    }
  }

  const confirmRoleAction = async () => {
    if (!pendingRoleAction) return
    const action = pendingRoleAction
    setPendingRoleAction(null)
    if (action.type === 'change') {
      await changeRole(action.email, action.role)
    } else {
      await deleteRole(action.email)
    }
  }

  const currentClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null
  }, [clients, selectedClientId])

  const allClientSectionsOpen = Boolean(
    currentClient?.sections.length &&
    currentClient.sections.every(section => openSections.has(section.title)),
  )

  const toggleAllClientSections = () => {
    if (!currentClient) return
    setOpenSections(previous => {
      const next = new Set(previous)
      for (const section of currentClient.sections) {
        if (allClientSectionsOpen) next.delete(section.title)
        else next.add(section.title)
      }
      return next
    })
  }

  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return auditLogs.filter(log => {
      if (auditEventFilter !== 'all' && log.event_type !== auditEventFilter) return false
      if (!query) return true
      return [
        log.actor_email,
        log.action,
        log.entity_type,
        log.entity_name,
        log.summary,
      ].some(value => value?.toLowerCase().includes(query))
    })
  }, [auditLogs, auditSearch, auditEventFilter])

  const visibleQualityIssues = useMemo(() => {
    const rulesByCode = new Map(qualityRules.map(rule => [rule.issue_code, rule]))
    return qualityIssues
      .filter(issue => rulesByCode.get(issue.issue_code)?.enabled !== false)
      .map(issue => {
        const configuredSeverity = rulesByCode.get(issue.issue_code)?.severity
        return configuredSeverity && configuredSeverity !== issue.severity
          ? { ...issue, severity: configuredSeverity }
          : issue
      })
  }, [qualityIssues, qualityRules])

  const filteredQualityIssues = useMemo(() => {
    const query = qualitySearch.trim().toLowerCase()
    return visibleQualityIssues.filter(issue => {
      if (qualitySeverity !== 'all' && issue.severity !== qualitySeverity) return false
      const item = allItems.find(candidate => candidate.id === issue.item_id)
      const client = clients.find(candidate => candidate.id === item?.client_id)
      return !query || [issue.message, issue.issue_code, item?.name, client?.name]
        .some(value => value?.toLowerCase().includes(query))
    })
  }, [visibleQualityIssues, qualitySearch, qualitySeverity, allItems, clients])

  const globalStats = useMemo(() => ({
    clients: clients.length,
    total: allItems.length,
    expiring: allItems.filter(i => getItemStatus(i.expiration_date) === 'Expiring').length,
    critical: allItems.filter(i => getItemStatus(i.expiration_date) === 'Expired').length,
    withCredentials: allItems.filter(i => hasCredentials(i)).length,
  }), [clients, allItems])

  const expiringItems = useMemo(() => {
    return allItems
      .filter(i => {
        if (!i.expiration_date) return false
        const days = getDaysUntilExpiration(i.expiration_date)
        const status = getItemStatus(i.expiration_date)
        if (days !== null && days > alertThreshold) return false
        if (alertStatus === 'All') return true
        return status === alertStatus
      })
      .sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
  }, [allItems, alertStatus, alertThreshold])


  const statsModalItems = useMemo(() => {
    switch (statsModal) {
      case 'total': return [...allItems].sort((a, b) => a.name.localeCompare(b.name))
      case 'expiring': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Expiring').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      case 'critical': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Expired').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      case 'alerts': return expiringItems
      default: return []
    }
  }, [statsModal, allItems, expiringItems])

  const handleDelete = async (id: string) => {
    await deleteItem(id)
    setDeleteConfirm(null)
  }

  const handleEditClient = (client: ClientWithItems) => {
    setEditClientId(client.id)
    setEditClientName(client.name)
  }

  const handleSaveClientName = async () => {
    if (!editClientId || !editClientName.trim()) return
    setSavingClient(true)
    await updateClient(editClientId, editClientName.trim())
    setSavingClient(false)
    setEditClientId(null)
    setEditClientName('')
  }

  const handleDeleteClient = async (clientId: string) => {
    await deleteClient(clientId)
    setDeleteConfirm(null)
    if (selectedClientId === clientId) {
      setSelectedClientId(null)
    }
  }

  const highlightSavedItem = (savedItem: { id: string; client_id: string; category: string }) => {
    setSelectedClientId(savedItem.client_id)
    setOpenSections(previous => new Set([...previous, savedItem.category]))
    setHighlightedItemId(savedItem.id)
    setTimeout(() => {
      document.getElementById(`item-${savedItem.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 350)
    setTimeout(() => setHighlightedItemId(null), 4000)
  }

  const closeItemModal = () => {
    setModalOpen(false)
    setEditItem(null)
    setNewItemDefaults(null)
  }

  const handleItemSaved = async (savedItem: { id: string; client_id: string; category: string }) => {
    setModalOpen(false)
    setEditItem(null)
    setNewItemDefaults(null)
    await fetchData(false)
    highlightSavedItem(savedItem)
  }

  const categories = [...new Set(allItems.map(i => i.category).filter(Boolean))].sort()
  const licenseTypes = [...new Set(
    allItems
      .filter(item => item.category === 'Licenses' && item.item_type)
      .map(item => item.item_type)
  )].sort()
  const superuserCount = allRoles.filter(role => role.role === 'superuser').length

  useEffect(() => {
    if (!loading) fetchQualityIssues()
  }, [loading])

  return (
    <div className="min-h-screen w-full min-w-0 bg-[#050d18] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full min-w-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full min-w-0 max-w-[1800px] flex-wrap items-center justify-between gap-2 px-4 py-4 md:px-6">
          <div className="flex items-center">
            <img src={logoImg} alt="JoSYS" className="h-8 md:h-10 w-auto object-contain brightness-125" />
          </div>
          <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 flex-col items-center">
            <span className="text-xl font-semibold text-slate-300 tracking-widest uppercase">Services Dashboard</span>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:w-auto sm:justify-end sm:gap-2">
            {user?.id && <ThemeToggle userId={user.id} />}
            <button
              onClick={() => fetchData()}
              className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading || refreshing ? 'animate-spin' : ''} />
            </button>
            {(hasPermission('alerts.configure') || hasPermission('roles.manage') || hasPermission('audit.view') || hasPermission('data.transfer') || hasPermission('records.create')) && (
              <>
                {hasPermission('alerts.configure') && <button
                  onClick={openAlertSettings}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-colors"
                  title="Configure email alerts"
                >
                  <Calendar size={14} />
                  <span className="hidden md:inline">Email alerts</span>
                </button>}
                {hasPermission('roles.manage') && <button
                  onClick={fetchRoles}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
                  title="Manage roles"
                >
                  <Users size={14} />
                  <span className="hidden md:inline">{hasPermission('permissions.manage') ? 'Access' : 'Roles'}</span>
                </button>}
                {hasPermission('audit.view') && <button
                  onClick={fetchAuditLogs}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
                  title="Review activity logs"
                >
                  <ClipboardList size={14} />
                  <span className="hidden md:inline">Audit logs</span>
                </button>}
                {hasPermission('data.transfer') && <button
                  onClick={() => setDataTransferModal(true)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
                  title="Import or export CMDB data"
                >
                  <ArrowUpDown size={14} />
                  <span className="hidden md:inline">Data</span>
                </button>}
                {hasPermission('records.create') && <button
                  onClick={() => { setEditItem(null); setNewItemDefaults(null); setModalOpen(true) }}
                  className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 p-2.5 sm:px-4 rounded-xl text-sm shadow-lg shadow-cyan-600/20 transition-all"
                  title="New record"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">New record</span>
                </button>}
              </>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              title={user?.email ?? 'Sign out'}
              aria-label="Sign out"
              className="flex min-h-10 min-w-10 touch-manipulation items-center justify-center gap-2 bg-slate-800 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 px-3 py-2.5 rounded-xl text-sm transition-all"
            >
              <LogOut size={14} />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {refreshing && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-24 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-400/50 bg-slate-900/95 px-4 py-2.5 text-xs font-medium text-cyan-100 shadow-xl shadow-cyan-500/20 backdrop-blur-sm"
        >
          <RefreshCw size={13} className="animate-spin" />
          <span>Updating…</span>
        </div>
      )}

      <div className="mx-auto w-full min-w-0 max-w-[1800px] p-4 md:p-6">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="relative z-20 min-w-0 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/50 p-4 shadow-xl h-fit">
            {/* Search */}
            <div className="relative z-50 rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3">
                <Search size={16} className="text-slate-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSearchDropdown(true) }}
                  onFocus={() => setShowSearchDropdown(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && matchingClientResults.length > 0) {
                      setSelectedClientId(matchingClientResults[0].id)
                      setShowSearchDropdown(false)
                    } else if (e.key === 'Enter' && searchResults.length > 0) {
                      navigateToItem(searchResults[0].item)
                    }
                    if (e.key === 'Escape') { setSearch(''); setShowSearchDropdown(false) }
                  }}
                  placeholder="Search client, IP, system..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500"
                />
                {search && (
                  <button onClick={() => { setSearch(''); setShowSearchDropdown(false) }} className="text-slate-500 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
              {/* Search Dropdown */}
              {showSearchDropdown && matchingClientResults.length === 0 && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[70dvh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[36rem]">
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
                <p className="text-xs text-slate-400">Clients</p>
                <p className="mt-1 text-2xl font-bold">{globalStats.clients}</p>
              </button>
              <button onClick={() => { setStatsModal('total'); setModalSearch('') }} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-slate-600 hover:bg-slate-800 transition-all">
                <p className="text-xs text-slate-400">Total Items</p>
                <p className="mt-1 text-2xl font-bold">{globalStats.total}</p>
              </button>
              {hasPermission('quality.view') && <button
                onClick={() => fetchQualityIssues(true)}
                className={`col-span-2 rounded-2xl border p-4 text-left transition-colors ${
                  visibleQualityIssues.length > 0
                    ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15'
                    : 'border-slate-800 bg-slate-900 hover:bg-slate-800'
                }`}
              >
                <p className="text-xs text-slate-400">Data Quality Issues</p>
                <p className={`mt-1 text-2xl font-bold ${visibleQualityIssues.length > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {visibleQualityIssues.length}
                </p>
              </button>}

            </div>

            {/* Category Filter */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 uppercase tracking-wide px-1">Filter by category</label>
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
              <p className="px-1 text-xs uppercase tracking-[0.25em] text-slate-500">Clients</p>
              <div className="max-h-[700px] overflow-y-auto space-y-2 pr-1">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 animate-pulse">
                      <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-slate-800 rounded w-1/2" />
                    </div>
                  ))
                ) : filteredClients.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">No clients found</p>
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
                            <p className="mt-1 text-xs text-slate-400">{client.sections.length} sections</p>
                          </div>
                        </button>
                        <div className="flex items-start gap-1.5">
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              {client.summary.services}
                            </span>
                            {(client.summary.expiring > 0 || client.summary.critical > 0) && (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                                {client.summary.expiring + client.summary.critical} alerts
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-40 hover:opacity-100 transition-opacity">
                            {hasPermission('records.edit') && <button
                              onClick={(e) => { e.stopPropagation(); handleEditClient(client) }}
                              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                              title="Edit cliente"
                            >
                              <Pencil size={12} />
                            </button>}
                            {hasPermission('records.delete') && <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(`client:${client.id}`) }}
                              className="p-1.5 rounded-lg hover:bg-red-600/80 text-slate-400 hover:text-white transition-all"
                              title="Delete cliente"
                            >
                              <Trash2 size={12} />
                            </button>}
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
          <main className="relative z-0 min-w-0 space-y-4 rounded-3xl border border-slate-800 bg-slate-950/40 p-4 shadow-xl md:p-5">
            {/* Expiration alerts - always visible */}
     
            {!loading && hasPermission('alerts.view') && (
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
          <h3 className="text-sm font-semibold text-amber-200">Expiration alerts</h3>
          <p className="text-xs text-amber-400/60">{expiringItems.length} items need attention</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {expiringItems.length > 5 && alertsExpanded && (
          <span className="text-xs text-amber-400/50 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
            showing 5 of {expiringItems.length}
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
          <span className="text-xs text-slate-500 uppercase tracking-wider flex-shrink-0">Threshold:</span>
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
            {['All', 'Expired', 'Expiring'].map(x => (
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
          {expiringItems.length === 0 && (
            <div className="px-5 py-8 text-center">
              <CheckCircle size={24} className="mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-slate-300">No alerts match these filters</p>
              <p className="mt-1 text-xs text-slate-500">Change the threshold or status to see other expirations.</p>
            </div>
          )}
          {expiringItems.slice(0, 5).map(item => {
            const status = getItemStatus(item.expiration_date)
            const days = getDaysUntilExpiration(item.expiration_date)
            const client = clients.find(c => c.id === item.client_id)
            const isStale = isProcessStale(item)

            return (
              <div
                key={item.id}
                onClick={() => navigateToItem(item)}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors group ${
                  status === 'Expired'
                    ? 'hover:bg-rose-500/[0.04]'
                    : 'hover:bg-amber-500/[0.04]'
                }`}
              >
                {/* Barra de severidad */}
                <div className={`w-[3px] h-6 rounded-full flex-shrink-0 ${
                  status === 'Expired' ? 'bg-rose-500' : 'bg-amber-500'
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
                        <span className="text-xs text-orange-400/80">No follow-up +5d</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Días / Status */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-xs text-slate-500 font-mono hidden sm:inline">{item.expiration_date}</span>
                  <span className={`text-sm font-bold tabular-nums ${
                    status === 'Expired' ? 'text-rose-400' : 'text-amber-300'
                  }`}>
                    {status === 'Expired' ? 'Expired' : `${days}d`}
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
            onClick={() => { setStatsModal('alerts'); setModalSearch('') }}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/[0.04] transition-all border-t border-amber-500/10"
          >
            View all {expiringItems.length} alerts
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
                <p className="text-slate-400">Select a client to view their services</p>
              </div>
            ) : (
              <>
                {/* Client stats */}
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
                    <p className="text-xs text-slate-400">Services</p>
                    <p className="mt-2 text-2xl font-bold">{currentClient.summary.services}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
                    <p className="text-xs text-slate-400">Licenses</p>
                    <p className="mt-2 text-2xl font-bold">{currentClient.summary.licenses}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-xs text-amber-200">Expiring soon</p>
                    <p className="mt-2 text-2xl font-bold text-amber-200">{currentClient.summary.expiring}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                    <p className="text-xs text-rose-200">Critical</p>
                    <p className="mt-2 text-2xl font-bold text-rose-200">{currentClient.summary.critical}</p>
                  </div>
                </div>


                {/* Client sections */}
                <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-3xl font-bold">{currentClient.name}</h2>
                      <p className="mt-1 text-slate-400">Full view of client services and access</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {currentClient.sections.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleAllClientSections}
                          className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-slate-700 hover:text-cyan-200"
                        >
                          {allClientSectionsOpen ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          {allClientSectionsOpen ? 'Collapse all' : 'Expand all'}
                        </button>
                      )}
                      <StatusPill status={currentClient.summary.critical > 0 ? 'Expired' : currentClient.summary.expiring > 0 ? 'Expiring' : 'OK'} />
                    </div>
                  </div>

                  <div className="space-y-5">
                    {currentClient.sections.map(section => (
                      <SectionCard
                        key={selectedClientId + '-' + section.title}
                        section={section}
                        defaultOpen={openSections.has(section.title)}
                        canCreate={hasPermission('records.create')}
                        highlightedItemId={highlightedItemId}
                        onOpenChange={(category, sectionOpen) => {
                          setOpenSections(previous => {
                            const next = new Set(previous)
                            if (sectionOpen) next.add(category)
                            else next.delete(category)
                            return next
                          })
                        }}
                        canEdit={hasPermission('records.edit')}
                        canDelete={hasPermission('records.delete')}
                        canViewCredentials={hasPermission('credentials.view')}
                        canViewHistory={hasPermission('history.view')}
                        onAdd={category => {
                          setEditItem(null)
                          setNewItemDefaults({ clientId: currentClient.id, category })
                          setModalOpen(true)
                        }}
                        onEdit={item => {
                          setOpenSections(previous => new Set([...previous, item.category]))
                          setNewItemDefaults(null)
                          setEditItem(item)
                          setModalOpen(true)
                        }}
                        onDelete={id => setDeleteConfirm(id)}
                        onDuplicate={duplicateItem}
                        onHistory={fetchHistory}
                      />
                    ))}
                    {currentClient.sections.length === 0 && (
                      <div className="text-center py-12 text-slate-500">
                        <Server size={32} className="mx-auto mb-3 opacity-30" />
                        <p>Este cliente no tiene records</p>
                        <button
                          onClick={() => {
                            setEditItem(null)
                            setNewItemDefaults({ clientId: currentClient.id, category: '' })
                            setModalOpen(true)
                          }}
                          className="mt-3 inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm"
                        >
                          <Plus size={14} /> Add first record
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
          licenseTypes={licenseTypes}
          canEditCredentials={hasPermission('credentials.edit')}
          defaultClientId={newItemDefaults?.clientId}
          defaultCategory={newItemDefaults?.category}
          onClose={closeItemModal}
          onSaved={handleItemSaved}
        />
      )}

      {dataTransferModal && (
        <Suspense fallback={null}>
          <DataTransferModal
            clients={clients}
            items={allItems}
            canImport={hasPermission('records.create')}
            onClose={() => setDataTransferModal(false)}
            onImported={fetchData}
          />
        </Suspense>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle size={24} />
              <h3 className="font-semibold text-lg">Confirm deletion</h3>
            </div>
            <p className="text-slate-400 text-sm">
              {deleteConfirm.startsWith('client:')
                ? 'Al eliminar el cliente también se eliminarán todos sus records asociados. Esta acción no se puede deshacer.'
                : 'This action cannot be undone. The record will be permanently deleted.'}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all">
                Cancel
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Name Modal */}
      {editClientId && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setEditClientId(null); setEditClientName('') }}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-cyan-400">
              <Pencil size={24} />
              <h3 className="font-semibold text-lg">Edit client name</h3>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-wide">Client name</label>
              <input
                type="text"
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveClientName() }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-500 outline-none transition-colors"
                placeholder="Client name"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditClientId(null); setEditClientName('') }}
                className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClientName}
                disabled={!editClientName.trim() || savingClient}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm transition-all"
              >
                {savingClient ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}


      {/* History Modal */}
      {historyItem && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setHistoryItem(null)}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <History size={16} className="text-cyan-400" />
                <h3 className="font-semibold">History — {historyItem.name}</h3>
              </div>
              <button onClick={() => setHistoryItem(null)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {loadingHistory ? (
                <div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
              ) : history.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">No change history yet</p>
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

      {/* Email Alert Settings Modal */}
      {alertSettingsModal && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setAlertSettingsModal(false)}>
          <div className="modal-surface flex max-h-[90dvh] w-full max-w-lg flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex flex-shrink-0 items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar size={17} className="text-amber-400" />
                <h3 className="font-semibold">Expiration email alerts</h3>
              </div>
              <button onClick={() => setAlertSettingsModal(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">Enable scheduled emails</span>
                  <span className="block text-xs text-slate-500">The Cron job still needs to be activated in Supabase.</span>
                </span>
                <input
                  type="checkbox"
                  checked={alertSettings.enabled}
                  onChange={event => setAlertSettings(current => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 accent-cyan-500"
                />
              </label>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">Sender email</label>
                <input
                  value={alertSettings.from_email}
                  onChange={event => setAlertSettings(current => ({ ...current, from_email: event.target.value }))}
                  placeholder="CMDB Alerts <alerts@example.com>"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">Recipients</label>
                <textarea
                  value={alertSettings.recipients}
                  onChange={event => setAlertSettings(current => ({ ...current, recipients: event.target.value }))}
                  rows={4}
                  placeholder={'admin@example.com\nrenewals@example.com'}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-slate-500">One address per line, or separate with commas.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 uppercase tracking-wide">Thresholds (days)</label>
                <input
                  value={alertSettings.thresholds}
                  onChange={event => setAlertSettings(current => ({ ...current, thresholds: event.target.value }))}
                  placeholder="90, 60, 30, 15, 7, 1, 0"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>
              {alertSettingsMessage && (
                <p className={`rounded-xl border px-3 py-2 text-xs ${
                  alertSettingsMessage === 'Settings saved.' ||
                  alertSettingsMessage === 'No new notifications to send.' ||
                  alertSettingsMessage.startsWith('Send complete:')
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}>{alertSettingsMessage}</p>
              )}
            </div>
            <div className="flex flex-shrink-0 flex-wrap justify-end gap-2 border-t border-slate-800 p-4 sm:p-5">
              <button onClick={fetchNotificationHistory} className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 sm:mr-auto sm:w-auto">
                Delivery history
              </button>
              <button
                onClick={sendAlertsNow}
                disabled={sendingAlertsNow || savingAlertSettings}
                title="Check now using the saved settings"
                className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50"
              >
                {sendingAlertsNow ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {sendingAlertsNow ? 'Sending…' : 'Send now'}
              </button>
              <button onClick={() => setAlertSettingsModal(false)} className="rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">Close</button>
              <button
                onClick={saveAlertSettings}
                disabled={savingAlertSettings || sendingAlertsNow}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm hover:bg-cyan-500 disabled:opacity-50"
              >
                {savingAlertSettings ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {notificationHistoryModal && (
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setNotificationHistoryModal(false)}>
          <div className="modal-surface flex max-h-[86dvh] w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div>
                <h3 className="font-semibold">Expiration delivery history</h3>
                <p className="text-xs text-slate-500">{notifications.length} recent delivery record(s)</p>
              </div>
              <button onClick={() => setNotificationHistoryModal(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {loadingNotifications ? (
                <RefreshCw className="mx-auto my-10 animate-spin text-cyan-400" size={22} />
              ) : notifications.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">No deliveries have been recorded.</p>
              ) : notifications.map(notification => {
                const item = allItems.find(candidate => candidate.id === notification.item_id)
                const client = clients.find(candidate => candidate.id === item?.client_id)
                return (
                  <div key={notification.id} className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item?.name ?? 'Deleted license'}</p>
                        <p className="text-xs text-slate-500">{client?.name ?? 'Unknown client'} · {notification.recipient}</p>
                      </div>
                      <span className={`h-fit rounded-full px-2 py-1 text-[10px] uppercase ${notification.status === 'sent' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {notification.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Expiration {notification.expiration_date} · threshold {notification.threshold_days}d · {new Date(notification.sent_at).toLocaleString()}
                    </p>
                    {notification.error && <p className="mt-2 text-xs text-rose-300">{notification.error}</p>}
                    {hasPermission('alerts.configure') && (
                      <button
                        onClick={() => queueNotificationRetry(notification.id)}
                        className="mt-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
                      >
                        Queue for resend
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Data Quality Modal */}
      {qualityIssuesModal && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setQualityIssuesModal(false)}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <div>
                <h3 className="font-semibold">Data Quality Issues</h3>
                <p className="text-xs text-slate-500">{visibleQualityIssues.length} unresolved issue(s)</p>
              </div>
              <button onClick={() => setQualityIssuesModal(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid gap-2 border-b border-slate-800 p-4 sm:grid-cols-[1fr_180px]">
              <input
                value={qualitySearch}
                onChange={event => setQualitySearch(event.target.value)}
                placeholder="Search client, license or issue..."
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none"
              />
              <select
                value={qualitySeverity}
                onChange={event => setQualitySeverity(event.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none"
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
              </select>
            </div>
            {hasPermission('quality.configure') && qualityRules.length > 0 && (
              <div className="border-b border-slate-800 p-4">
                <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Validation rules</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {qualityRules.map(rule => (
                    <label key={rule.issue_code} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/50 px-3 py-2 text-xs">
                      <span className="truncate" title={rule.label}>{rule.label}</span>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        disabled={savingQualityRule !== null}
                        onChange={() => toggleQualityRule(rule)}
                        className="h-4 w-4 accent-cyan-500 disabled:cursor-wait disabled:opacity-50"
                      />
                    </label>
                  ))}
                </div>
                {qualityRuleError && (
                  <p className="mt-2 text-xs text-rose-300">{qualityRuleError}</p>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredQualityIssues.length === 0 ? (
                <div className="py-10 text-center text-emerald-400">
                  <CheckCircle size={30} className="mx-auto mb-2" />
                  <p className="text-sm">No unresolved data issues.</p>
                </div>
              ) : filteredQualityIssues.map(issue => {
                const item = allItems.find(candidate => candidate.id === issue.item_id)
                const client = clients.find(candidate => candidate.id === item?.client_id)
                return (
                  <button
                    key={issue.id}
                    onClick={() => {
                      if (item) navigateToItem(item)
                      setQualityIssuesModal(false)
                    }}
                    className="w-full rounded-xl border border-slate-800 bg-slate-800/40 p-4 text-left transition-colors hover:border-slate-600 hover:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item?.name ?? 'Unknown license'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{client?.name ?? 'Unknown client'} · {issue.field_name ?? issue.issue_code}</p>
                        <p className="mt-2 text-xs text-slate-300">{issue.message}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] uppercase ${
                        issue.severity === 'critical'
                          ? 'bg-rose-500/15 text-rose-300'
                          : issue.severity === 'error'
                            ? 'bg-orange-500/15 text-orange-300'
                            : 'bg-amber-500/15 text-amber-300'
                      }`}>{issue.severity}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Administrative Audit Logs Modal */}
      {auditLogsModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAuditLogsModal(false)}>
          <div className="modal-surface flex max-h-[86vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-5">
              <div className="flex items-center gap-3">
                <ClipboardList size={20} className="text-cyan-400" />
                <div>
                  <h3 className="font-semibold">Administrative audit logs</h3>
                  <p className="text-xs text-slate-500">Automatic retention: 15 days · latest 500 events</p>
                </div>
              </div>
              <button onClick={() => setAuditLogsModal(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-2 border-b border-slate-800 p-4 sm:grid-cols-[1fr_220px_auto]">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
                <Search size={14} className="text-slate-500" />
                <input
                  value={auditSearch}
                  onChange={event => setAuditSearch(event.target.value)}
                  placeholder="Search user, action, client or record..."
                  className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-600"
                />
              </div>
              <select
                value={auditEventFilter}
                onChange={event => setAuditEventFilter(event.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none"
              >
                <option value="all">All event types</option>
                <option value="authentication">Authentication</option>
                <option value="data_change">Data changes</option>
                <option value="security">Security and roles</option>
              </select>
              <button
                onClick={fetchAuditLogs}
                disabled={loadingAuditLogs}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loadingAuditLogs ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {loadingAuditLogs ? (
                <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-cyan-400" /></div>
              ) : auditLogsError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
                  {auditLogsError}
                </div>
              ) : filteredAuditLogs.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No audit events match these filters.</p>
              ) : filteredAuditLogs.map(log => {
                const isExpanded = expandedAuditLogId === log.id
                const eventColor = log.event_type === 'authentication'
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : log.event_type === 'security'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-violet-500/15 text-violet-300'
                return (
                  <div key={log.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-800/40">
                    <button
                      onClick={() => setExpandedAuditLogId(isExpanded ? null : log.id)}
                      className="flex w-full flex-col items-stretch gap-3 p-4 text-left hover:bg-slate-800/70 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${eventColor}`}>
                            {log.event_type.replace('_', ' ')}
                          </span>
                          <span className="max-w-full truncate text-xs font-medium text-slate-300" title={log.actor_email ?? 'system'}>
                            {log.actor_email ?? 'system'}
                          </span>
                        </div>
                        <p className="break-words text-sm text-white">{log.summary}</p>
                        <p className="mt-1 break-words text-xs text-slate-500">
                          {log.entity_name ?? log.entity_type ?? 'Session'} · {log.action}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-slate-500 sm:justify-end">
                        <span>{new Date(log.occurred_at).toLocaleString()}</span>
                        <ChevronDown size={15} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="grid gap-3 border-t border-slate-800 bg-slate-950/50 p-4 lg:grid-cols-2">
                        <div>
                          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Previous values</p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[11px] text-rose-200">
                            {log.old_data ? JSON.stringify(log.old_data, null, 2) : 'No previous values'}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">New values / metadata</p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-3 text-[11px] text-emerald-200">
                            {JSON.stringify(log.new_data ?? log.metadata ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Roles Modal */}
      {rolesModal && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setRolesModal(false)}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[86dvh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-cyan-400" />
                <h3 className="font-semibold">Access Control</h3>
              </div>
              <button onClick={() => setRolesModal(false)} className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-800"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={newRoleEmail}
                  onChange={e => setNewRoleEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none"
                />
                <select
                  value={newRoleValue}
                  onChange={e => setNewRoleValue(e.target.value as 'admin' | 'viewer')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white outline-none sm:w-auto"
                >
                  {userRole === 'superuser' && <option value="superuser">Superuser</option>}
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={saveRole}
                  disabled={!newRoleEmail.trim() || savingRoleEmail !== null}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-xl text-sm transition-all whitespace-nowrap sm:w-auto"
                >
                  {savingRoleEmail === newRoleEmail.trim() ? 'Saving…' : '+ Agregar'}
                </button>
              </div>
              {roleError && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {roleError}
                </p>
              )}
              {allRoles.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">No roles configured</p>
              ) : (
                allRoles.map(r => (
                  <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-3">
                    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" title={r.user_email}>{r.user_email}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <select
                        value={r.role}
                        onChange={event => setPendingRoleAction({
                          type: 'change',
                          email: r.user_email,
                          role: event.target.value as CmdbRole,
                        })}
                        disabled={savingRoleEmail !== null || (r.role === 'superuser' && (userRole !== 'superuser' || superuserCount === 1))}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none disabled:opacity-50"
                        aria-label={`Role for ${r.user_email}`}
                      >
                        {userRole === 'superuser' && <option value="superuser">Superuser</option>}
                        <option value="admin">Admin</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      {r.user_email !== user?.email && (
                      <button
                        onClick={() => setPendingRoleAction({ type: 'delete', email: r.user_email })}
                        disabled={savingRoleEmail !== null || r.role === 'superuser'}
                        title={r.role === 'superuser' ? 'Superusers cannot be deleted here' : 'Delete role'}
                        className="text-slate-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs px-2 py-1 rounded-lg hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                      )}
                      </div>
                    </div>
                    {hasPermission('permissions.manage') && (
                      <div className="mt-3 space-y-4 border-t border-slate-700/50 pt-3">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Functional permissions</p>
                            {r.role !== 'superuser' && (
                              <div className="flex flex-wrap gap-1">
                                {Object.keys(PERMISSION_TEMPLATES).map(template => (
                                  <button
                                    key={template}
                                    type="button"
                                    onClick={() => applyPermissionTemplate(r.id, template)}
                                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300"
                                  >
                                    {template}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {CMDB_PERMISSION_KEYS.map(permission => (
                              <label key={permission} className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={r.role === 'superuser' || rolePermissions[r.id]?.has(permission) || false}
                                  disabled={r.role === 'superuser'}
                                  onChange={event => toggleRolePermission(r.id, permission, event.target.checked)}
                                  className="h-4 w-4 accent-cyan-500"
                                />
                                {PERMISSION_LABELS[permission]}
                              </label>
                            ))}
                          </div>
                        </div>
                        {r.role !== 'superuser' && (
                          <div>
                            <div className="mb-2 grid grid-cols-[1fr_44px_44px] gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                              <span>Category scope</span><span>View</span><span>Edit</span>
                            </div>
                            <div className="space-y-1.5">
                              {categories.map(category => {
                                const access = roleCategoryAccess[r.id]?.[category]
                                const canView = access?.view ?? true
                                const canEdit = access?.edit ?? (rolePermissions[r.id]?.has('records.edit') || false)
                                return (
                                  <div key={category} className="grid grid-cols-[1fr_44px_44px] items-center gap-2 rounded-lg bg-slate-900/50 px-2 py-1.5">
                                    <span className="truncate text-xs text-slate-300">{category}</span>
                                    <input
                                      type="checkbox"
                                      checked={canView}
                                      onChange={event => toggleCategoryAccess(r.id, category, 'view', event.target.checked)}
                                      className="h-4 w-4 accent-cyan-500"
                                      aria-label={`View ${category}`}
                                    />
                                    <input
                                      type="checkbox"
                                      checked={canView && canEdit}
                                      disabled={!canView}
                                      onChange={event => toggleCategoryAccess(r.id, category, 'edit', event.target.checked)}
                                      className="h-4 w-4 accent-cyan-500 disabled:opacity-30"
                                      aria-label={`Edit ${category}`}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          {pendingRoleAction && (
            <div
              className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
              onClick={() => setPendingRoleAction(null)}
            >
              <div
                className="modal-surface w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <h4 className="text-lg font-semibold text-white">Confirm role change</h4>
                <p className="mt-2 text-sm text-slate-400">
                  {pendingRoleAction.type === 'change'
                    ? `Change ${pendingRoleAction.email} to ${pendingRoleAction.role}?`
                    : `Delete the assigned role for ${pendingRoleAction.email}?`}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  This action changes the user's CMDB permissions immediately.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    onClick={() => setPendingRoleAction(null)}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRoleAction}
                    className={`rounded-xl px-4 py-2 text-sm text-white transition-colors ${
                      pendingRoleAction.type === 'delete'
                        ? 'bg-rose-600 hover:bg-rose-500'
                        : 'bg-cyan-600 hover:bg-cyan-500'
                    }`}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Stats Detail Modal */}
      {statsModal && (
        <div className="modal-backdrop fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setStatsModal(null); setModalSearch('') }}>
          <div className="modal-surface bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <h3 className="font-semibold text-lg">
                {statsModal === 'clients' && `Clients (${globalStats.clients})`}
                {statsModal === 'total' && `All los items (${globalStats.total})`}
                {statsModal === 'expiring' && `Expiring soon (${globalStats.expiring})`}
                {statsModal === 'critical' && `Critical / Expireds (${globalStats.critical})`}
                {statsModal === 'alerts' && `Expiration alerts (${expiringItems.length})`}
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
                  const expiring = cItems.filter(i => getItemStatus(i.expiration_date) === 'Expiring').length
                  const critical = cItems.filter(i => getItemStatus(i.expiration_date) === 'Expired').length
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
                    <button key={item.id} onClick={() => { setStatsModal(null); setModalSearch(''); navigateToItem(item) }} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-800/50 px-4 py-3 hover:border-slate-600 hover:bg-slate-700/50 transition-all text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{clientName} · {item.category}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                        {item.expiration_date && days !== null && (
                          <span className="text-xs text-slate-400">
                            {days < 0 ? `Expired hace ${Math.abs(days)}d` : `${days}d`}
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
                  <p className="text-sm">No items in this category</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
