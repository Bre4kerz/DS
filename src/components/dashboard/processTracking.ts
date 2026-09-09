import { type CmdbItem, getItemStatus } from '../../lib/supabase'

export function getProcessTracking(item: CmdbItem): { ageDays: number | null; limitDays: number; stalled: boolean } | null {
  if (!item.process?.trim()) return null
  const limitDays = Math.min(365, Math.max(1, item.process_stale_days ?? 5))
  if (!item.process_updated_at) return { ageDays: null, limitDays, stalled: false }
  const updated = new Date(item.process_updated_at)
  if (Number.isNaN(updated.getTime())) return { ageDays: null, limitDays, stalled: false }
  const ageDays = Math.max(0, Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24)))
  return { ageDays, limitDays, stalled: ageDays >= limitDays }
}

export function isProcessStale(item: CmdbItem): boolean {
  const status = getItemStatus(item.expiration_date)
  if (status === 'OK' || status === 'No date') return false
  return getProcessTracking(item)?.stalled === true
}
