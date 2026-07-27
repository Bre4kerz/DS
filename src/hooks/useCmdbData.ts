import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase, CmdbClient, CmdbItem, ItemHistory, UserRole, ClientSummary, SectionData, computeClientSummary, groupItemsByCategory } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export type ClientWithItems = CmdbClient & {
  items: CmdbItem[]
  summary: ClientSummary
  sections: SectionData[]
}

const CMDB_ITEM_SELECT = `
  id, client_id, category, type, item_type, name, domain_version, role_use,
  ip, serial, email, expiration_date, notes, sort_order, status, process,
  process_updated_at, updated_by, created_at, updated_at, has_credentials
`

export function useCmdbData(user: User | null) {
  const [clients, setClients] = useState<ClientWithItems[]>([])
  const [allItems, setAllItems] = useState<CmdbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('viewer')
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
    supabase.from('cmdb_user_roles').select('*').eq('user_email', user.email).maybeSingle()
      .then(({ data }) => {
        if (data) setUserRole(data.role as 'admin' | 'viewer')
        else setUserRole('viewer')
      })
  }, [user])

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

  const saveRole = useCallback(async (email: string, role: 'admin' | 'viewer') => {
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
