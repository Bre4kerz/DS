import { useState, useMemo, useCallback, memo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Lock, LogIn, Monitor } from 'lucide-react'
import logoImg from '../assets/logo1.png'
import FloatingLines from './FloatingLines'
import BorderGlow from './BorderGlow'
import SpecularButton from './SpecularButton'

// Memoizar componentes pesados para evitar re-renders cuando cambia el estado del formulario
const MemoizedFloatingLines = memo(FloatingLines)
const MemoizedBorderGlow = memo(BorderGlow)

export default function LoginPage() {
  const { signIn, signInWithMicrosoft } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Memoizar props de FloatingLines para que no cambien de referencia en cada render
  const floatingLinesProps = useMemo(() => ({
    linesGradient: ['#0100f0', '#6f6fff', '#b6b6b6'],
    enabledWaves: ['top', 'middle', 'bottom'] as Array<'top' | 'middle' | 'bottom'>,
    lineCount: 8,
    lineDistance: 8,
    bendRadius: 8,
    bendStrength: -2,
    interactive: true,
    parallax: true,
    animationSpeed: 1,
    mixBlendMode: 'screen' as const,
  }), [])

  // Memoizar props de BorderGlow
  const borderGlowProps = useMemo(() => ({
    edgeSensitivity: 30,
    glowColor: '220 80 80',
    backgroundColor: 'rgba(5,13,24,0.75)',
    borderRadius: 20,
    glowRadius: 40,
    glowIntensity: 1.2,
    coneSpread: 25,
    animated: false,
    colors: ['#0100f0', '#6f6fff', '#38bdf8'],
  }), [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) setError(error.message)

    setLoading(false)
  }, [email, password, signIn])

  const handleMicrosoft = useCallback(async () => {
    setError('')
    setLoading(true)

    const { error } = await signInWithMicrosoft()

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }, [signInWithMicrosoft])

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#050d18]">

        {/* Fondo - Memoizado para evitar recreación del canvas WebGL en cada render */}
        <div className="absolute inset-0 z-0">
          <MemoizedFloatingLines {...floatingLinesProps} />
        </div>

        {/* Login - Memoizado para evitar parpadeo del glow */}
        <MemoizedBorderGlow
          {...borderGlowProps}
          className="relative z-10 w-full max-w-md mx-4 backdrop-blur-md"
        >
            <div className="flex items-center justify-center mb-8">
              <img
                src={logoImg}
                alt="JoSYS"
                className="h-12 object-contain"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/20 border border-rose-400/30 text-rose-400 text-sm">
                {error}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">
                  Email address
                </label>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="user@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/80 border border-white/30 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1.5">
                  Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/80 border border-white/30 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                  />
                </div>
              </div>

              {/* BOTÓN INICIAR SESIÓN REEMPLAZADO POR SPECULARBUTTON */}
              <div className="flex justify-center">
                <SpecularButton
                  type="submit"
                  size="lg"
                  radius={18}
                  tint="#0100f0"
                  tintOpacity={0.15}
                  blur={0}
                  textColor="#ffffff"
                  lineColor="#6f6fff"
                  baseColor="#0a1a3a"
                  intensity={1.2}
                  shineSize={12}
                  shineFade={35}
                  thickness={1.5}
                  speed={0.4}
                  followMouse
                  proximity={250}
                  autoAnimate={false}
                  disabled={loading}
                  className="w-full"
                >
                  <span className="flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" />
                    {loading ? 'Processing...' : 'Sign in'}
                  </span>
                </SpecularButton>
              </div>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20" />
              </div>

              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-[#050d18] text-white/60">
                  o
                </span>
              </div>
            </div>

            <button
              onClick={handleMicrosoft}
              disabled={true}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/20 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Monitor className="w-4 h-4 text-blue-600" />
              Continue with Microsoft
            </button>
          </div>
        </MemoizedBorderGlow>
      </div>
    </>
  )
}
