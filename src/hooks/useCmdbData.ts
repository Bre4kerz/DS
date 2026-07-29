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
  ip, serial, email, expiration_date, notes, sort_order, status, process,
  process_updated_at, updated_by, created_at, updated_at, has_credentials
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

export function useCmdbData(user: User | null) {
  const [clients, setClients] = useState<ClientWithItems[]>([])
  const [allItems, setAllItems] = useState<CmdbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<CmdbRole>('viewer')
  const [permissions, setPermissions] = useState<Set<CmdbPermission>>(
    new Set(['records.view', 'history.view', 'alerts.view', 'quality.view']),
  )
  const [history, setHistory] = useState<ItemHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [allRoles, setAllRoles] = useState<UserRole[]>([])
  const hasFetchedRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [])

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!user?.email) return
    const loadAccess = async () => {
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

    void loadAccess()
    const refreshAccess = () => {
      void loadAccess()
      void fetchData()
    }
    const channel = supabase.channel(`cmdb-access-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_roles' }, refreshAccess)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_permissions' }, refreshAccess)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cmdb_user_category_access' }, refreshAccess)
      .subscribe()

    return () => {
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
      updated_at: new Date().toISOString(),
    })
    if (error) console.error('Error duplicando item:', error)
    fetchData()
  }, [fetchData])

  const handleDelete = useCallback(async (id: string) => {
    await supabase.from('cmdb_items').delete().eq('id', id)
    fetchData()
  }, [fetchData])

  const handleDeleteClient = useCallback(async (clientId: string) => {
    await supabase.from('cmdb_clients').delete().eq('id', clientId)
    fetchData()
  }, [fetchData])

  const handleEditClient = useCallback(async (clientId: string, name: string) => {
    await supabase.from('cmdb_clients').update({ name }).eq('id', clientId)
    fetchData()
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
    loading,
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
