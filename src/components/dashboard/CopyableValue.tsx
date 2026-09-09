import { useState } from 'react'
import { CheckCircle, Copy } from 'lucide-react'

export default function CopyableValue({ value, label = 'IP' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copyIp = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!value) return <span className="text-slate-600">—</span>

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-cyan-400/80 text-[11px] truncate">{value}</span>
      <button
        type="button"
        onClick={copyIp}
        className={`rounded-md p-1 transition-colors ${
          copied
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'text-slate-600 hover:bg-slate-700 hover:text-cyan-300'
        }`}
        title={copied ? 'Copied' : `Copy ${label}`}
        aria-label={copied ? `${label} copied` : `Copy ${label} ${value}`}
      >
        {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
      </button>
    </div>
  )
}
