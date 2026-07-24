import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes in ms
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithMicrosoft: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRef = useRef<User | null>(null)

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      signOut()
    }, INACTIVITY_TIMEOUT)
  }, [signOut])

  // Start/stop inactivity timer based on session
  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    // Start timer and attach activity listeners
    resetTimer()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))

    // ⬇️ NUEVO: Reiniciar timer al volver a la pestaña
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, resetTimer])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      userRef.current = session?.user ?? null
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // ⬇️ NUEVO: Ignorar TOKEN_REFRESHED si el usuario no cambió
      if (event === 'TOKEN_REFRESHED') {
        const newUser = session?.user ?? null
        if (newUser?.id === userRef.current?.id) {
          // Solo actualizar la sesión, no el usuario (evita re-render)
          setSession(session)
          return
        }
      }

      const newUser = session?.user ?? null
      userRef.current = newUser
      setSession(session)
      setUser(newUser)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }

  const signInWithMicrosoft = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid',
        redirectTo: `${window.location.origin}/`,
      },
    })
    return { error }
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithMicrosoft, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
