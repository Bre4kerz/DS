import { useState, useCallback } from 'react'
import { CmdbItem } from '../lib/supabase'

type NewItemDefaults = { clientId: string; category: string } | null
type StatsModalType = null | 'clients' | 'total' | 'expiring' | 'critical' | 'alerts'

export function useCmdbModals() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CmdbItem | null>(null)
  const [newItemDefaults, setNewItemDefaults] = useState<NewItemDefaults>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [historyItem, setHistoryItem] = useState<CmdbItem | null>(null)
  const [statsModal, setStatsModal] = useState<StatsModalType>(null)
  const [modalSearch, setModalSearch] = useState('')
  const [rolesModal, setRolesModal] = useState(false)

  const openEditModal = useCallback((item?: CmdbItem | null) => {
    setNewItemDefaults(null)
    setEditItem(item ?? null)
    setModalOpen(true)
  }, [])

  const closeEditModal = useCallback(() => {
    setModalOpen(false)
    setEditItem(null)
    setNewItemDefaults(null)
  }, [])

  const openNewItem = useCallback((defaults?: NewItemDefaults) => {
    setEditItem(null)
    setNewItemDefaults(defaults ?? null)
    setModalOpen(true)
  }, [])

  const handleEditClient = useCallback((clientId: string, clientName: string) => {
    setEditClientId(clientId)
    setEditClientName(clientName)
  }, [])

  const closeEditClient = useCallback(() => {
    setEditClientId(null)
    setEditClientName('')
  }, [])

  const openStatsModal = useCallback((type: StatsModalType) => {
    setStatsModal(type)
    setModalSearch('')
  }, [])

  const closeStatsModal = useCallback(() => {
    setStatsModal(null)
    setModalSearch('')
  }, [])

  return {
    modalOpen, setModalOpen,
    editItem, setEditItem,
    newItemDefaults, setNewItemDefaults,
    deleteConfirm, setDeleteConfirm,
    editClientId, setEditClientId,
    editClientName, setEditClientName,
    savingClient, setSavingClient,
    historyItem, setHistoryItem,
    statsModal, setStatsModal,
    modalSearch, setModalSearch,
    rolesModal, setRolesModal,
    openEditModal,
    closeEditModal,
    openNewItem,
    handleEditClient,
    closeEditClient,
    openStatsModal,
    closeStatsModal,
  }
}
