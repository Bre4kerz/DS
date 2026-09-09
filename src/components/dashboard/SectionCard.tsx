import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, ArrowUpDown, BadgeCheck, ChevronDown, ChevronRight, Copy as CopyIcon,
  Globe, HardDrive, History, KeyRound, Lock, MoreHorizontal, Pencil, Plus, Printer,
  Server, Shield, Trash2, Wifi,
} from 'lucide-react'
import { type CmdbItem, type SectionData, hasCredentials } from '../../lib/supabase'
import { getProcessTracking } from './processTracking'
import { DEFAULT_SECTION_COLUMNS, type SectionColumnKey } from './sectionColumns'
import ColumnVisibilityMenu from './ColumnVisibilityMenu'
import CopyableValue from './CopyableValue'
import SecureCredentialsPanel from './SecureCredentialsPanel'
import SensitiveCopyableValue from './SensitiveCopyableValue'
import StatusPill from './StatusPill'

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

type CategoryStyle = {
  border: string
  icon: string
  rgb: string
  lightRgb: string
}

const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  border: 'border-slate-700/60',
  icon: 'bg-slate-800 text-slate-300',
  rgb: '100 116 139',
  lightRgb: '95 112 131',
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  'Servers': {
    border: 'border-cyan-500/30',
    icon: 'bg-cyan-500/10 text-cyan-300',
    rgb: '34 211 238',
    lightRgb: '8 145 178',
  },
  'NAS/Storage': {
    border: 'border-amber-500/30',
    icon: 'bg-amber-500/10 text-amber-300',
    rgb: '251 191 36',
    lightRgb: '180 83 9',
  },
  'Remote Access': {
    border: 'border-violet-500/30',
    icon: 'bg-violet-500/10 text-violet-300',
    rgb: '167 139 250',
    lightRgb: '124 58 237',
  },
  'OA Devices': {
    border: 'border-sky-500/30',
    icon: 'bg-sky-500/10 text-sky-300',
    rgb: '56 189 248',
    lightRgb: '3 105 161',
  },
  'Managed services': {
    border: 'border-emerald-500/30',
    icon: 'bg-emerald-500/10 text-emerald-300',
    rgb: '52 211 153',
    lightRgb: '4 120 87',
  },
  'Licenses': {
    border: 'border-rose-500/30',
    icon: 'bg-rose-500/10 text-rose-300',
    rgb: '251 113 133',
    lightRgb: '190 18 60',
  },
  'Services': {
    border: 'border-blue-500/30',
    icon: 'bg-blue-500/10 text-blue-300',
    rgb: '96 165 250',
    lightRgb: '29 78 216',
  },
  'VPN': {
    border: 'border-indigo-500/30',
    icon: 'bg-indigo-500/10 text-indigo-300',
    rgb: '129 140 248',
    lightRgb: '79 70 229',
  },
  'Firewall': {
    border: 'border-orange-500/30',
    icon: 'bg-orange-500/10 text-orange-300',
    rgb: '251 146 60',
    lightRgb: '194 65 12',
  },
  'Antivirus': {
    border: 'border-red-500/30',
    icon: 'bg-red-500/10 text-red-300',
    rgb: '248 113 113',
    lightRgb: '185 28 28',
  },
  'Backup': {
    border: 'border-teal-500/30',
    icon: 'bg-teal-500/10 text-teal-300',
    rgb: '45 212 191',
    lightRgb: '15 118 110',
  },
  'Red': {
    border: 'border-lime-500/30',
    icon: 'bg-lime-500/10 text-lime-300',
    rgb: '163 230 53',
    lightRgb: '77 124 15',
  },
}

export default function SectionCard({ section, defaultOpen = false, canCreate = false, canEdit = false, canDelete = false, canViewCredentials = false, canEditCredentials = false, canViewHistory = false, highlightedItemId, onOpenChange, onAdd, onEdit, onDelete, onDuplicate, onHistory, onBulkReplaceCredentials, onBulkReplaceItems, onBulkDeleteItems }: {
  section: SectionData
  defaultOpen?: boolean
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  canViewCredentials?: boolean
  canEditCredentials?: boolean
  canViewHistory?: boolean
  highlightedItemId?: string | null
  onOpenChange: (category: string, open: boolean) => void
  onAdd: (category: string) => void
  onEdit: (item: CmdbItem) => void
  onDelete: (id: string) => void
  onDuplicate: (item: CmdbItem) => void
  onHistory: (item: CmdbItem) => void
  onBulkReplaceCredentials: (category: string) => void
  onBulkReplaceItems: (category: string) => void
  onBulkDeleteItems: (category: string, items: CmdbItem[]) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'type-asc' | 'type-desc'>('name-asc')
  const [credentialMenuOpen, setCredentialMenuOpen] = useState(false)
  const [credentialMenuPosition, setCredentialMenuPosition] = useState({ top: 0, left: 0 })
  const credentialMenuButtonRef = useRef<HTMLButtonElement>(null)
  const credentialMenuRef = useRef<HTMLDivElement>(null)
  const icon = CATEGORY_ICONS[section.title] || <Server size={18} />
  const categoryStyle = CATEGORY_STYLES[section.title] || DEFAULT_CATEGORY_STYLE
  const isLicenseSection = section.title === 'Licenses'
  const [visibleColumns, setVisibleColumns] = useState<Record<SectionColumnKey, boolean>>(() => {
    const categoryDefaults = { ...DEFAULT_SECTION_COLUMNS, status: isLicenseSection }
    try {
      const stored = localStorage.getItem(`cmdb-section-columns:v2:${section.title}`)
      return stored ? { ...categoryDefaults, ...JSON.parse(stored) } : categoryDefaults
    } catch {
      return categoryDefaults
    }
  })
  const hasExpiring = section.rows.some(r => r.status === 'Expiring' || r.status === 'Expired')
  const hasCreds = canViewCredentials && section.rows.some(r => hasCredentials(r.item))
  const columnOptions: Array<{ key: SectionColumnKey; label: string }> = [
    { key: 'type', label: 'Type' },
    { key: 'primaryDetail', label: isLicenseSection ? 'Vendor' : 'Domain / Version' },
    { key: 'secondaryDetail', label: isLicenseSection ? 'Branch' : 'Usage / Roles' },
    { key: 'identifier', label: isLicenseSection ? 'Serial / License' : 'IP / ID' },
    { key: 'status', label: 'Status' },
    ...(isLicenseSection ? [{ key: 'process' as const, label: 'Process' }] : []),
  ]
  const visibleColumnCount = 3 + columnOptions.filter(option => visibleColumns[option.key]).length

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

  useEffect(() => {
    localStorage.setItem(`cmdb-section-columns:v2:${section.title}`, JSON.stringify(visibleColumns))
  }, [section.title, visibleColumns])

  useEffect(() => {
    if (!credentialMenuOpen) return

    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!credentialMenuButtonRef.current?.contains(target) && !credentialMenuRef.current?.contains(target)) {
        setCredentialMenuOpen(false)
      }
    }
    const closeMenu = () => setCredentialMenuOpen(false)

    document.addEventListener('pointerdown', closeIfOutside)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [credentialMenuOpen])

  const toggleCredentialMenu = () => {
    if (credentialMenuOpen) {
      setCredentialMenuOpen(false)
      return
    }
    const rect = credentialMenuButtonRef.current?.getBoundingClientRect()
    if (rect) {
      const actionCount = Number(canEdit) + Number(canEdit && canEditCredentials && hasCreds) + Number(canDelete)
      const estimatedMenuHeight = actionCount * 58 + 12
      const opensUpward = window.innerHeight - rect.bottom < estimatedMenuHeight + 16
      setCredentialMenuPosition({
        top: opensUpward ? Math.max(8, rect.top - estimatedMenuHeight - 8) : rect.bottom + 8,
        left: Math.max(12, rect.right - 208),
      })
    }
    setCredentialMenuOpen(true)
  }

  return (
    <div
      className={`category-card overflow-hidden rounded-2xl border ${categoryStyle.border} ${
      hasExpiring ? 'shadow-lg shadow-amber-500/5' : ''
      } bg-[#0b0f24]`}
      data-open={open}
      style={{
        '--category-dark-rgb': categoryStyle.rgb,
        '--category-light-rgb': categoryStyle.lightRgb,
      } as React.CSSProperties}
    >

      <div className="category-card-header flex w-full items-center justify-between gap-3 px-5 py-4">
        <button onClick={toggleSection} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <div className="flex items-center gap-3.5">
          <div className={`category-icon rounded-xl p-2.5 ${categoryStyle.icon}`}>
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
          {(canEdit || canDelete) && (
            <button
              ref={credentialMenuButtonRef}
              type="button"
              onClick={toggleCredentialMenu}
              className="rounded-lg border border-slate-700/60 p-1.5 text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800/70 hover:text-white"
              aria-label={`More actions for ${section.title}`}
              aria-haspopup="menu"
              aria-expanded={credentialMenuOpen}
              title="More actions"
            >
              <MoreHorizontal size={16} />
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
            <div className="flex items-center gap-2">
              <ColumnVisibilityMenu
                options={columnOptions}
                visible={visibleColumns}
                onToggle={key => setVisibleColumns(previous => ({ ...previous, [key]: !previous[key] }))}
              />
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
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium w-10"></th>
                  {visibleColumns.type && <th className="px-3 py-2.5 text-left font-medium">Type</th>}
                  <th className="px-3 py-2.5 text-left font-medium">Name</th>
                  {visibleColumns.primaryDetail && <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">{isLicenseSection ? 'Vendor' : 'Domain / Version'}</th>}
                  {visibleColumns.secondaryDetail && <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">{isLicenseSection ? 'Branch' : 'Usage / Roles'}</th>}
                  {visibleColumns.identifier && <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">{isLicenseSection ? 'Serial / License' : 'IP / ID'}</th>}
                  {visibleColumns.status && <th className="w-32 whitespace-nowrap px-3 py-2.5 text-left font-medium">Status</th>}
                  {isLicenseSection && visibleColumns.process && <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell">Process</th>}
                  <th className="px-5 py-2.5 text-right font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const isExpanded = expandedRows.has(row.id)
                  const creds = canViewCredentials && hasCredentials(row.item)
                  const isHighlighted = highlightedItemId === row.id
                  const processTracking = isLicenseSection ? getProcessTracking(row.item) : null

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

                        {visibleColumns.type && <td className="px-3 py-3">
                          <span className="text-slate-400 text-[12px]">{row.type || '—'}</span>
                        </td>}

                        <td className="px-3 py-3">
                          <div>
                            <p className="text-white font-medium text-[13px]">{row.name || '—'}</p>
                            {row.item.notes && (
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">{row.item.notes}</p>
                            )}
                            {isLicenseSection && (
                              <>
                                <p className="text-[10px] text-cyan-500/70 mt-0.5 truncate max-w-[220px]">
                                  QTY: {row.item.qty ?? 1}
                                </p>
                                {row.item.process && (
                                  <p className={`mt-1 max-w-[240px] truncate text-[10px] lg:hidden ${
                                    processTracking?.stalled ? 'text-orange-300' : 'text-violet-300'
                                  }`}>
                                    {row.item.process}
                                    {processTracking?.ageDays !== null && processTracking?.ageDays !== undefined
                                      ? ` · ${processTracking.ageDays}d`
                                      : ''}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        {visibleColumns.primaryDetail && <td className="px-3 py-3 hidden md:table-cell">
                          <span className="text-slate-400 text-[12px]">{isLicenseSection ? row.item.vendor || '—' : row.domain || '—'}</span>
                        </td>}

                        {visibleColumns.secondaryDetail && <td className="px-3 py-3 hidden lg:table-cell">
                          <span className="text-slate-500 text-[11px]">{isLicenseSection ? row.item.branch || '—' : row.role || '—'}</span>
                        </td>}

                        {visibleColumns.identifier && <td className="px-3 py-3 hidden sm:table-cell">
                          {isLicenseSection ? (
                            <SensitiveCopyableValue value={row.item.serial ?? ''} label="serial or license" />
                          ) : (
                            <CopyableValue value={row.ip} label="IP" />
                          )}
                        </td>}

                        {visibleColumns.status && <td className="px-3 py-3">
                          <StatusPill status={row.status} />
                        </td>}

                        {isLicenseSection && visibleColumns.process && (
                          <td className="hidden max-w-[220px] px-3 py-3 lg:table-cell">
                            {row.item.process ? (
                              <div title={row.item.process}>
                                <p className="truncate text-[11px] font-medium text-violet-300">{row.item.process}</p>
                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${
                                  processTracking?.stalled
                                    ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                                    : 'border-slate-700 bg-slate-800/60 text-slate-400'
                                }`}>
                                  {processTracking?.ageDays === null
                                    ? 'Tracking not started'
                                    : processTracking?.stalled
                                      ? `Stalled · ${processTracking?.ageDays}d`
                                      : `${processTracking?.ageDays ?? 0}d in stage · limit ${processTracking?.limitDays ?? 5}d`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        )}

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
                          <td colSpan={visibleColumnCount} className="px-0 py-0">
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

      {credentialMenuOpen && createPortal(
        <div
          ref={credentialMenuRef}
          role="menu"
          aria-label={`Actions for ${section.title}`}
          className="section-actions-menu fixed z-[70] w-52 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md"
          style={{ top: credentialMenuPosition.top, left: credentialMenuPosition.left }}
        >
          {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setCredentialMenuOpen(false)
              onBulkReplaceItems(section.title)
            }}
            className="section-actions-menu-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors"
          >
            <ArrowUpDown size={14} />
            <span>
              <span className="block">Bulk edit records</span>
              <span className="mt-0.5 block text-[10px] font-normal opacity-60">Replace matching field values</span>
            </span>
          </button>
          )}
          {canEdit && canEditCredentials && hasCreds && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setCredentialMenuOpen(false)
              onBulkReplaceCredentials(section.title)
            }}
            className="section-actions-menu-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors"
          >
            <KeyRound size={14} />
            <span>
              <span className="block">Replace credentials</span>
              <span className="mt-0.5 block text-[10px] font-normal opacity-60">Update matching values in bulk</span>
            </span>
          </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setCredentialMenuOpen(false)
                onBulkDeleteItems(section.title, section.rows.map(row => row.item))
              }}
              className="section-actions-menu-item section-actions-menu-item-danger flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors"
            >
              <Trash2 size={14} />
              <span>
                <span className="block">Delete multiple records</span>
                <span className="mt-0.5 block text-[10px] font-normal opacity-60">Select records to remove</span>
              </span>
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
