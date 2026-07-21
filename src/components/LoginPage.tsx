import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Lock, LogIn, Monitor } from 'lucide-react'
import logoImg from '../assets/logo1.png'
import FloatingLines from './FloatingLines'

export default function LoginPage() {
  const { signIn, signInWithMicrosoft } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleMicrosoft = async () => {
    setError('')
    setLoading(true)
    const { error } = await signInWithMicrosoft()
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

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

      {/* FloatingLines background */}
      <div className="absolute inset-0 z-0">
        <FloatingLines
          linesGradient={['#0100f0', '#6f6fff', '#b6b6b6']}
          enabledWaves={['top', 'middle', 'bottom']}
          lineCount={8}
          lineDistance={8}
          bendRadius={8}
          bendStrength={-2}
          interactive={true}
          parallax={true}
          animationSpeed={1}
          mixBlendMode="screen"
        />
      </div>

      {/* Login card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 p-8 rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 shadow-2xl"
        style={{
          animation: 'fadeInUp 0.7s ease-out both',
        }}
      >
        <div className="flex items-center justify-center mb-8">
          <img src={logoImg} alt="JoSYS" className="h-12 object-contain" />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Correo electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/80 border border-white/30 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                placeholder="usuario@empresa.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/80 border border-white/30 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Procesando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/20" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-transparent text-white/60">o</span>
          </div>
        </div>

        <button
          onClick={handleMicrosoft}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/20 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Monitor className="w-4 h-4 text-blue-600" />
          Continuar con Microsoft
        </button>
      </div>
    </div>
    </>
  )
}
