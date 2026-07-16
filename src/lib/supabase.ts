import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  ip: string
  serial: string
  email: string
  expiration_date: string | null
  notes: string
  sort_order: number
  cred_user: string
  cred_password: string
  cred_user_alt: string
  cred_password_alt: string
  cred_notes: string
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
  role: 'admin' | 'viewer'
  created_at: string
}

export type ItemStatus = 'OK' | 'Próximo' | 'Vencido' | 'Sin fecha'

export function getItemStatus(expiration_date: string | null): ItemStatus {
  if (!expiration_date) return 'Sin fecha'
  const exp = new Date(expiration_date)
  const now = new Date()
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Vencido'
  if (diffDays <= 30) return 'Próximo'
  return 'OK'
}

export function getDaysUntilExpiration(expiration_date: string | null): number | null {
  if (!expiration_date) return null
  const exp = new Date(expiration_date)
  const now = new Date()
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
    expiring: items.filter(i => getItemStatus(i.expiration_date) === 'Próximo').length,
    critical: items.filter(i => getItemStatus(i.expiration_date) === 'Vencido').length,
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
  return !!(item.cred_user || item.cred_password || item.cred_user_alt || item.cred_password_alt)
}

export function getCredentials(item: CmdbItem): Credentials {
  return {
    user: item.cred_user || '',
    password: item.cred_password || '',
    user_alt: item.cred_user_alt || '',
    password_alt: item.cred_password_alt || '',
    notes: item.cred_notes || '',
  }
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
      status: getItemStatus(item.expiration_date),
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
