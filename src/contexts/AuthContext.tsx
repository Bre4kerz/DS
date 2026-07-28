import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { clearLocalSupabaseSession, supabase } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000
const ACTIVITY_THROTTLE = 1000
const ACTIVITY_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'input',
  'change',
  'touchstart',
  'wheel',
  'scroll',
] as const
const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithMicrosoft: () => Promise<{ error: Error | null }>
  signOut: (reason?: 'manual' | 'inactivity') => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimerResetRef = useRef(0)
  const userRef = useRef<User | null>(null)

  const signOut = useCallback(async (reason: 'manual' | 'inactivity' = 'manual') => {
    if (userRef.current) {
      const auditRequest = supabase.rpc('log_cmdb_auth_event', {
        p_action: reason === 'inactivity' ? 'inactivity_logout' : 'logout',
        p_metadata: { source: 'dashboard' },
      })
      await Promise.race([
        auditRequest,
        new Promise(resolve => window.setTimeout(resolve, 800)),
      ]).catch(() => undefined)
    }

    setSession(null)
    setUser(null)
    userRef.current = null

    const sdkSignOut = supabase.auth.signOut({ scope: 'local' })
    await Promise.race([
      sdkSignOut,
      new Promise(resolve => window.setTimeout(resolve, 1200)),
    ]).catch(() => undefined)

    // auth-js performs a network request even for local scope. If Safari loses
    // that request, it returns before clearing storage, so remove the same
    // browser keys explicitly as a final local fallback.
    clearLocalSupabaseSession()
  }, [])

  const resetTimer = useCallback(() => {
    lastTimerResetRef.current = Date.now()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      signOut('inactivity')
    }, INACTIVITY_TIMEOUT)
  }, [signOut])

  const handleActivity = useCallback(() => {
    if (Date.now() - lastTimerResetRef.current < ACTIVITY_THROTTLE) return
    resetTimer()
  }, [resetTimer])

  // Start/stop inactivity timer based on session
  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    // Start timer and attach activity listeners
    resetTimer()
    ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, handleActivity, ACTIVITY_LISTENER_OPTIONS)
    })

    // ⬇️ NUEVO: Reiniciar timer al volver a la pestaña
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, handleActivity, { capture: true })
      })
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, resetTimer, handleActivity])

  useEffect(() => {
    const logSessionStart = async (activeSession: Session) => {
      const sessionMarker = `cmdb-login-audited:${activeSession.user.id}:${activeSession.expires_at ?? 'session'}`
      if (sessionStorage.getItem(sessionMarker)) return
      const { error } = await supabase.rpc('log_cmdb_auth_event', {
        p_action: 'login',
        p_metadata: {
          source: 'dashboard',
          provider: activeSession.user.app_metadata.provider ?? 'email',
        },
      })
      if (!error) sessionStorage.setItem(sessionMarker, 'true')
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      userRef.current = session?.user ?? null
      if (session) void logSessionStart(session)
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
      if (event === 'SIGNED_IN' && session) void logSessionStart(session)
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
