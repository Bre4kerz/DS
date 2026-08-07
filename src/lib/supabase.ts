import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function clearLocalSupabaseSession(): void {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    localStorage.removeItem(`sb-${projectRef}-auth-token`)
    localStorage.removeItem(`sb-${projectRef}-auth-token-code-verifier`)
  } catch {
    // The in-memory React session is still cleared when storage is unavailable.
  }
}

export type CmdbClient = {
  id: string
  name: string
  notes: string
  created_at: string
}

export type CmdbItem = {
  id: string
  client_id: string
  category: string
  type: string
  item_type: string
  name: string
  domain_version: string
  role_use: string
  vendor: string
  branch: string
  qty: number
  ip: string
  serial: string
  email: string
  expiration_date: string | null
  expiration_not_required: boolean
  notes: string
  sort_order: number
  has_credentials: boolean
  status: string
  process: string
  process_updated_at: string | null
  updated_by: string
  created_at: string
  updated_at: string
  cmdb_clients?: CmdbClient
}

export type ItemHistory = {
  id: string
  item_id: string
  user_email: string
  changed_at: string
  changes: Record<string, { from: unknown; to: unknown }>
}

export type UserRole = {
  id: string
  user_email: string
  role: 'superuser' | 'admin' | 'viewer'
  created_at: string
}

export type ItemStatus = 'OK' | 'Expiring' | 'Expired' | 'No date' | 'Not required'

function getCalendarDayDifference(expirationDate: string): number {
  const [year, month, day] = expirationDate.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  const now = new Date()
  const expirationDay = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((expirationDay - today) / (1000 * 60 * 60 * 24))
}

export function getItemStatus(expiration_date: string | null, expirationNotRequired = false): ItemStatus {
  if (expirationNotRequired) return 'Not required'
  if (!expiration_date) return 'No date'
  const diffDays = getCalendarDayDifference(expiration_date)
  if (Number.isNaN(diffDays)) return 'No date'
  if (diffDays < 0) return 'Expired'
  if (diffDays <= 30) return 'Expiring'
  return 'OK'
}

export function getDaysUntilExpiration(expiration_date: string | null): number | null {
  if (!expiration_date) return null
  const diffDays = getCalendarDayDifference(expiration_date)
  return Number.isNaN(diffDays) ? null : diffDays
}

export type ClientSummary = {
  services: number
  licenses: number
  expiring: number
  critical: number
}

export function computeClientSummary(items: CmdbItem[]): ClientSummary {
  const licenseCategories = ['Licenses', 'Antivirus', 'Backup']
  return {
    services: items.length,
    licenses: items.filter(i => licenseCategories.includes(i.category)).length,
    expiring: items.filter(i => getItemStatus(i.expiration_date) === 'Expiring').length,
    critical: items.filter(i => getItemStatus(i.expiration_date) === 'Expired').length,
  }
}

export type SectionData = {
  title: string
  rows: Array<{
    id: string
    type: string
    name: string
    domain: string
    role: string
    ip: string
    status: ItemStatus
    item: CmdbItem
  }>
}

export type Credentials = {
  user: string
  password: string
  user_alt: string
  password_alt: string
  notes: string
}

export function hasCredentials(item: CmdbItem): boolean {
  return item.has_credentials === true
}

export async function revealCredentials(itemId: string): Promise<Credentials> {
  const { data, error } = await supabase.rpc('reveal_cmdb_credentials_authorized', { p_item_id: itemId }).maybeSingle()
  if (error) throw error
  const credentials = data as {
    username?: string
    password?: string
    alternative_username?: string
    alternative_password?: string
    notes?: string
  } | null

  return {
    user: credentials?.username ?? '',
    password: credentials?.password ?? '',
    user_alt: credentials?.alternative_username ?? '',
    password_alt: credentials?.alternative_password ?? '',
    notes: credentials?.notes ?? '',
  }
}

export async function saveCredentials(itemId: string, credentials: Credentials): Promise<void> {
  const { error } = await supabase.rpc('save_cmdb_credentials_authorized', {
    p_item_id: itemId,
    p_username: credentials.user,
    p_password: credentials.password,
    p_alternative_username: credentials.user_alt,
    p_alternative_password: credentials.password_alt,
    p_notes: credentials.notes,
  })
  if (error) throw error
}

export function groupItemsByCategory(items: CmdbItem[]): SectionData[] {
  const grouped = new Map<string, SectionData['rows']>()
  for (const item of items) {
    const rows = grouped.get(item.category) ?? []
    rows.push({
      id: item.id,
      type: item.item_type || item.type,
      name: item.name,
      domain: item.domain_version,
      role: item.role_use,
      ip: item.ip,
      status: getItemStatus(item.expiration_date, item.expiration_not_required),
      item,
    })
    grouped.set(item.category, rows)
  }
  const order = ['Servers', 'NAS/Storage', 'Remote Access', 'OA Devices', 'Managed services', 'Licenses', 'Services', 'Firewall', 'VPN', 'Antivirus', 'Backup', 'Red']
  return Array.from(grouped.entries())
    .sort((a, b) => {
      const ia = order.indexOf(a[0])
      const ib = order.indexOf(b[0])
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0])
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    .map(([title, rows]) => ({ title, rows }))
}
