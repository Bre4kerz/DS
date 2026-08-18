import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase, CmdbClient, CmdbItem, ItemHistory, UserRole, ClientSummary, SectionData, computeClientSummary, groupItemsByCategory } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export type ClientWithItems = CmdbClient & {
  items: CmdbItem[]
  summary: ClientSummary
  sections: SectionData[]
}

const CMDB_ITEM_SELECT = `
  id, client_id, category, type, item_type, name, domain_version, role_use, vendor, branch, qty,
  ip, serial, email, expiration_date, expiration_not_required, notes, sort_order, status, process,
  process_updated_at, process_stale_days, updated_by, created_at, updated_at, has_credentials
`

export const CMDB_PERMISSION_KEYS = [
  'records.view', 'records.create', 'records.edit', 'records.delete',
  'credentials.view', 'credentials.edit', 'history.view',
  'alerts.view', 'alerts.configure', 'quality.view',
  'quality.configure', 'audit.view', 'roles.manage', 'permissions.manage',
  'data.transfer',
] as const

export type CmdbPermission = typeof CMDB_PERMISSION_KEYS[number]
type CmdbRole = 'superuser' | 'admin' | 'viewer'

type CmdbAccessPayload = {
  role?: unknown
  permissions?: unknown
}

const isCmdbRole = (value: unknown): value is CmdbRole =>
  value === 'superuser' || value === 'admin' || value === 'viewer'

const isCmdbPermission = (value: unknown): value is CmdbPermission =>
  typeof value === 'string' && CMDB_PERMISSION_KEYS.includes(value as CmdbPermission)

export function useCmdbData(user: User | null) {
  const [clients, setClients] = useState<ClientWithItems[]>([])
  const [allItems, setAllItems] = useState<CmdbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userRole, setUserRole] = useState<CmdbRole>('viewer')
  const [permissions, setPermissions] = useState<Set<CmdbPermission>>(
    new Set(['records.view', 'history.view', 'alerts.view', 'quality.view']),
  )
  const [history, setHistory] = useState<ItemHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [allRoles, setAllRoles] = useState<UserRole[]>([])
  const hasFetchedRef = useRef(false)
  const accessRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    try {
      const [{ data: clientData }, { data: itemData }] = await Promise.all([
        supabase.from('cmdb_clients').select('*').order('name'),
        supabase.from('cmdb_items').select(CMDB_ITEM_SELECT).order('created_at', { ascending: false }),
      ])

      const typedItems = (itemData ?? []) as unknown as CmdbItem[]
      const processedClients: ClientWithItems[] = (clientData ?? []).map(client => {
        const clientItems = typedItems
          .filter(i => i.client_id === client.id)
          .map(i => ({ ...i, expiration_date: i.expiration_date || null }))
        return {
          ...client,
          items: clientItems,
          summary: computeClientSummary(clientItems),
          sections: groupItemsByCategory(clientItems),
        }
      })

      setClients(processedClients)
      const normalizedItems = typedItems.map(i => ({
        ...i,
        expiration_date: i.expiration_date || null,
      }))
      setAllItems(normalizedItems)
    } finally {
      if (showLoading) setLoading(false)
      else setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!user?.email) return
    const loadLegacyAccess = async () => {
      const { data } = await supabase.from('cmdb_user_roles')
        .select('*').eq('user_email', user.email!).maybeSingle()
      const role = data?.role as CmdbRole | undefined
      setUserRole(role ?? 'viewer')
      const defaults = role === 'superuser'
        ? CMDB_PERMISSION_KEYS
        : role === 'admin'
          ? CMDB_PERMISSION_KEYS.filter(permission => permission !== 'permissions.manage')
          : ['records.view', 'history.view', 'alerts.view', 'quality.view'] as CmdbPermission[]
      const results = await Promise.all(CMDB_PERMISSION_KEYS.map(async permission => {
        const { data: allowed, error } = await supabase.rpc('cmdb_has_permission', {
          p_permission: permission,
        })
        return { permission, allowed: allowed === true, failed: Boolean(error) }
      }))
      const rpcAvailable = results.some(result => !result.failed)
      const resolved = results
        .filter(result => !result.failed && result.allowed)
        .map(result => result.permission)
      setPermissions(new Set(rpcAvailable ? resolved : defaults))
    }

    const loadAccess = async () => {
      const { data, error } = await supabase.rpc('cmdb_get_my_access')
      if (error?.code === 'PGRST202') {
        await loadLegacyAccess()
        return
      }
      if (error) {
        console.error('Error loading CMDB access:', error)
        return
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.error('Invalid CMDB access response')
        return
      }

      const access = data as CmdbAccessPayload
      setUserRole(isCmdbRole(access.role) ? access.role : 'viewer')
      setPermissions(new Set(
        Array.isArray(access.permissions)
          ? access.permissions.filter(isCmdbPermission)
          : [],
      ))
    }

    void loadAccess()
    const refreshAccess = () => {
      if (accessRefreshTimerRef.current) clearTimeout(accessRefreshTimerRef.current)
      accessRefreshTimerRef.current = setTimeout(() => {
        accessRefreshTimerRef.current = null
        void Promise.all([loadAccess(), fetchData(false)])
      }, 250)
    }
    const channel = supabase.channel(`cmdb-access-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_roles' }, refreshAccess)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_permissions' }, refreshAccess)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_category_access' }, refreshAccess)
      .subscribe()

    return () => {
      if (accessRefreshTimerRef.current) {
        clearTimeout(accessRefreshTimerRef.current)
        accessRefreshTimerRef.current = null
      }
      void supabase.removeChannel(channel)
    }
  }, [user?.email, user?.id, fetchData])

  const duplicateItem = useCallback(async (item: CmdbItem) => {
    const rest: Partial<CmdbItem> = { ...item }
    delete rest.id
    delete rest.created_at
    delete rest.updated_at
    delete rest.cmdb_clients
    const { error } = await supabase.from('cmdb_items').insert({
      ...rest,
      name: rest.name + ' (copia)',
      has_credentials: false,
      process_updated_at: rest.process ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    if (error) console.error('Error duplicando item:', error)
    await fetchData(false)
  }, [fetchData])

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('cmdb_items').delete().eq('id', id)
    await fetchData(false)
  }, [fetchData])

  const handleDeleteClient = useCallback(async (clientId: string) => {
    await supabase.from('cmdb_clients').delete().eq('id', clientId)
    await fetchData(false)
  }, [fetchData])

  const handleEditClient = useCallback(async (clientId: string, name: string) => {
    await supabase.from('cmdb_clients').update({ name }).eq('id', clientId)
    await fetchData(false)
  }, [fetchData])

  const fetchHistory = useCallback(async (item: CmdbItem) => {
    setLoadingHistory(true)
    const { data } = await supabase
      .from('cmdb_item_history')
      .select('*')
      .eq('item_id', item.id)
      .order('changed_at', { ascending: false })
      .limit(20)
    setHistory(data ?? [])
    setLoadingHistory(false)
    return data ?? []
  }, [])

  const fetchRoles = useCallback(async () => {
    const { data } = await supabase.from('cmdb_user_roles').select('*').order('created_at')
    setAllRoles(data as UserRole[] ?? [])
    return data as UserRole[] ?? []
  }, [])

  const saveRole = useCallback(async (email: string, role: CmdbRole) => {
    const { error } = await supabase.from('cmdb_user_roles').upsert({ user_email: email, role }, { onConflict: 'user_email' })
    if (error) throw error
    if (email.toLowerCase() === user?.email?.toLowerCase()) setUserRole(role)
    await fetchRoles()
  }, [fetchRoles, user?.email])

  const deleteRole = useCallback(async (email: string) => {
    const { error } = await supabase.from('cmdb_user_roles').delete().eq('user_email', email)
    if (error) throw error
    await fetchRoles()
  }, [fetchRoles])

  return {
    clients, setClients,
    allItems, setAllItems,
    loading, refreshing,
    userRole,
    permissions,
    hasPermission: (permission: CmdbPermission) => permissions.has(permission),
    history, loadingHistory, setHistory, setLoadingHistory,
    allRoles, setAllRoles,
    fetchData,
    duplicateItem,
    handleDelete,
    handleDeleteClient,
    handleEditClient,
    fetchHistory,
    fetchRoles,
    saveRole,
    deleteRole,
  }
}
