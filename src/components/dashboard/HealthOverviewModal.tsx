import { Activity, X } from 'lucide-react'
import { type CmdbItem, getDaysUntilExpiration } from '../../lib/supabase'
import type { ClientWithItems } from '../../hooks/useCmdbData'

type QualitySeverity = 'critical' | 'error' | 'warning'
type QualityIssueLike = {
  item_id: string | null
  severity: QualitySeverity
}

const TILE_TONES = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  slate: 'border-slate-700 bg-slate-800/60 text-slate-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
} as const

const BADGE_TONES = {
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
} as const

function StatTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TILE_TONES }) {
  return (
    <div className={`rounded-2xl border p-4 ${TILE_TONES[tone]}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Badge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}

export default function HealthOverviewModal({
  allItems,
  clients,
  qualityIssues,
  onClose,
  onSelectClient,
}: {
  allItems: CmdbItem[]
  clients: ClientWithItems[]
  qualityIssues: QualityIssueLike[]
  onClose: () => void
  onSelectClient: (clientId: string) => void
}) {
  const expiringWithin = (maxDays: number, minDays = 0) => allItems.filter(item => {
    const days = getDaysUntilExpiration(item.expiration_date)
    return days !== null && days >= minDays && days <= maxDays
  }).length

  const expiring30 = expiringWithin(30)
  const expiring60 = expiringWithin(60, 31)
  const expiring90 = expiringWithin(90, 61)
  const expired = allItems.filter(item => {
    const days = getDaysUntilExpiration(item.expiration_date)
    return days !== null && days < 0
  }).length

  const qualityByClient = new Map<string, number>()
  const qualityBySeverity: Record<QualitySeverity, number> = { critical: 0, error: 0, warning: 0 }
  for (const issue of qualityIssues) {
    qualityBySeverity[issue.severity] = (qualityBySeverity[issue.severity] ?? 0) + 1
    const relatedItem = issue.item_id ? allItems.find(candidate => candidate.id === issue.item_id) : undefined
    if (!relatedItem?.client_id) continue
    qualityByClient.set(relatedItem.client_id, (qualityByClient.get(relatedItem.client_id) ?? 0) + 1)
  }

  const clientRows = clients
    .map(client => ({
      client,
      expiring: client.summary.expiring,
      expired: client.summary.critical,
      qualityIssues: qualityByClient.get(client.id) ?? 0,
    }))
    .filter(row => row.expiring > 0 || row.expired > 0 || row.qualityIssues > 0)
    .sort((a, b) => (b.expired * 2 + b.expiring + b.qualityIssues) - (a.expired * 2 + a.expiring + a.qualityIssues))

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="modal-surface flex max-h-[86vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div className="flex items-center gap-2 text-cyan-300">
            <Activity size={20} />
            <h3 className="text-lg font-semibold text-white">Health overview</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close health overview">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Upcoming expirations</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Expiring ≤30d" value={expiring30} tone="amber" />
              <StatTile label="31-60d" value={expiring60} tone="amber" />
              <StatTile label="61-90d" value={expiring90} tone="slate" />
              <StatTile label="Expired" value={expired} tone="rose" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Open data quality issues</p>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Critical" value={qualityBySeverity.critical} tone="rose" />
              <StatTile label="Error" value={qualityBySeverity.error} tone="amber" />
              <StatTile label="Warning" value={qualityBySeverity.warning} tone="slate" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Clients needing attention</p>
            {clientRows.length === 0 ? (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                Nothing needs attention right now.
              </p>
            ) : (
              <div className="space-y-1.5">
                {clientRows.map(row => (
                  <button
                    key={row.client.id}
                    type="button"
                    onClick={() => { onSelectClient(row.client.id); onClose() }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-800/40 px-4 py-3 text-left transition-colors hover:border-slate-600 hover:bg-slate-800"
                  >
                    <span className="truncate text-sm font-medium text-white">{row.client.name}</span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      {row.expiring > 0 && <Badge tone="amber">{row.expiring} expiring</Badge>}
                      {row.expired > 0 && <Badge tone="rose">{row.expired} expired</Badge>}
                      {row.qualityIssues > 0 && <Badge tone="violet">{row.qualityIssues} quality</Badge>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
