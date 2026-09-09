import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import CopyableValue from './CopyableValue'

export default function SensitiveCopyableValue({ value, label }: { value: string; label: string }) {
  const [revealed, setRevealed] = useState(false)

  if (!value) return <span className="text-slate-600">—</span>

  return (
    <div className="flex items-center gap-1.5">
      {revealed ? (
        <CopyableValue value={value} label={label} />
      ) : (
        <span className="font-mono text-[11px] tracking-wider text-slate-500">••••••••</span>
      )}
      <button
        type="button"
        onClick={event => {
          event.stopPropagation()
          setRevealed(current => !current)
        }}
        className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-700 hover:text-cyan-300"
        title={revealed ? `Hide ${label}` : `Reveal ${label}`}
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
      >
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  )
}
