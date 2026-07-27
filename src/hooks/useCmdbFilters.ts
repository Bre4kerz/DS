import { useState, useMemo, useCallback } from 'react'
import { CmdbItem, getItemStatus, getDaysUntilExpiration } from '../lib/supabase'
import { ClientWithItems } from './useCmdbData'

export function useCmdbFilters(allItems: CmdbItem[], clients: ClientWithItems[]) {
  const [search, setSearch] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('Todos')
  const [alertThreshold, setAlertThreshold] = useState<number>(365)
  const [alertStatus, setAlertStatus] = useState('Todos')
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return allItems
      .filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.ip?.toLowerCase().includes(q) ||
        i.serial?.toLowerCase().includes(q) ||
        i.domain_version?.toLowerCase().includes(q) ||
        i.vendor?.toLowerCase().includes(q) ||
        i.branch?.toLowerCase().includes(q)
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
          i.email?.toLowerCase().includes(q) ||
          i.vendor?.toLowerCase().includes(q) ||
          i.branch?.toLowerCase().includes(q)
        )
      )
    })
  }, [clients, search, categoryFilter])

  const currentClient = useMemo(() => {
    return clients.find(c => c.id === selectedClientId) || null
  }, [clients, selectedClientId])

  const globalStats = useMemo(() => ({
    clients: clients.length,
    total: allItems.length,
    expiring: allItems.filter(i => getItemStatus(i.expiration_date) === 'Expiring').length,
    critical: allItems.filter(i => getItemStatus(i.expiration_date) === 'Expired').length,
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

  const getStatsModalItems = useCallback((type: 'total' | 'expiring' | 'critical') => {
    switch (type) {
      case 'total': return [...allItems].sort((a, b) => a.name.localeCompare(b.name))
      case 'expiring': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Expiring').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      case 'critical': return allItems.filter(i => getItemStatus(i.expiration_date) === 'Expired').sort((a, b) => (a.expiration_date ?? '9999').localeCompare(b.expiration_date ?? '9999'))
      default: return [] as CmdbItem[]
    }
  }, [allItems])

  const navigateToItem = (item: CmdbItem) => {
    setSearch('')
    setShowSearchDropdown(false)
    setSelectedClientId(item.client_id ?? null)
    setOpenSections(prev => new Set([...prev, item.category]))
    setHighlightedItemId(item.id)
    setTimeout(() => setHighlightedItemId(null), 3000)
    setTimeout(() => {
      const el = document.getElementById('item-' + item.id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  return {
    search, setSearch,
    showSearchDropdown, setShowSearchDropdown,
    categoryFilter, setCategoryFilter,
    alertThreshold, setAlertThreshold,
    alertStatus, setAlertStatus,
    alertsExpanded, setAlertsExpanded,
    selectedClientId, setSelectedClientId,
    highlightedItemId,
    openSections, setOpenSections,
    searchResults,
    allCategories,
    filteredClients,
    currentClient,
    globalStats,
    expiringItems,
    getStatsModalItems,
    navigateToItem,
  }
}
