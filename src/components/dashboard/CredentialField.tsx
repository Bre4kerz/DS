import { useState } from 'react'
import { CheckCircle, Copy, Eye, EyeOff } from 'lucide-react'

export default function CredentialField({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyValue = async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-2 text-xs text-slate-400">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-cyan-300 truncate">
          {value ? (show ? value : '••••••••••••') : '—'}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShow(!show)}
            disabled={!value}
            className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title={show ? 'Hide' : 'Show'}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            onClick={copyValue}
            disabled={!value}
            className={`rounded-lg p-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              copied
                ? 'scale-110 bg-emerald-500/15 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
            title={copied ? 'Copied' : 'Copy'}
            aria-label={copied ? `${label} copied` : `Copy ${label}`}
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
