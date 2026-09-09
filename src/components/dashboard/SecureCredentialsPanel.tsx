import { useEffect, useState } from 'react'
import { type Credentials, revealCredentials } from '../../lib/supabase'
import CredentialField from './CredentialField'

export default function SecureCredentialsPanel({ itemId }: { itemId: string }) {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    revealCredentials(itemId)
      .then(data => {
        if (active) setCredentials(data)
      })
      .catch(fetchError => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : 'Could not reveal credentials')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [itemId])

  if (loading) return <p className="text-xs text-slate-500">Loading credentials…</p>
  if (error) return <p className="text-xs text-rose-400">{error}</p>
  if (!credentials) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CredentialField label="User" value={credentials.user} />
      <CredentialField label="Password" value={credentials.password} />
      <CredentialField label="User alt." value={credentials.user_alt} />
      <CredentialField label="Password alt." value={credentials.password_alt} />
    </div>
  )
}
