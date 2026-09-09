import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SlidersHorizontal } from 'lucide-react'
import type { SectionColumnKey } from './sectionColumns'

export default function ColumnVisibilityMenu({ options, visible, onToggle }: {
  options: Array<{ key: SectionColumnKey; label: string }>
  visible: Record<SectionColumnKey, boolean>
  onToggle: (key: SectionColumnKey) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const closeMenu = () => setOpen(false)
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [open])

  const toggleMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const estimatedHeight = options.length * 38 + 16
      const opensUpward = window.innerHeight - rect.bottom < estimatedHeight + 16
      setPosition({
        top: opensUpward ? Math.max(8, rect.top - estimatedHeight - 8) : rect.bottom + 8,
        left: Math.max(12, rect.right - 208),
      })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SlidersHorizontal size={12} />
        Columns
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Visible columns"
          className="section-actions-menu fixed z-[70] w-52 rounded-xl border p-1.5 shadow-2xl backdrop-blur-md"
          style={{ top: position.top, left: position.left }}
        >
          {options.map(option => (
            <label key={option.key} className="column-visibility-item flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors">
              <input
                type="checkbox"
                checked={visible[option.key]}
                onChange={() => onToggle(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
