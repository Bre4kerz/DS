import { describe, expect, it } from 'vitest'
import { getDaysUntilExpiration, getItemStatus } from './supabase'

describe('expiration helpers', () => {
  it('returns no date for missing values', () => {
    expect(getItemStatus(null)).toBe('No date')
    expect(getDaysUntilExpiration(null)).toBeNull()
  })

  it('returns no date for invalid calendar values', () => {
    expect(getItemStatus('invalid')).toBe('No date')
  })

  it('uses calendar dates for status boundaries', () => {
    const now = new Date()
    const future = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 31))
    const date = future.toISOString().slice(0, 10)
    expect(getItemStatus(date)).toBe('OK')
  })
})
