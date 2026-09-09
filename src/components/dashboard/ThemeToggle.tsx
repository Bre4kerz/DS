import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type ThemeMode = 'dark' | 'light'

export default function ThemeToggle({ userId }: { userId: string }) {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem(`cmdb-theme:${userId}`) === 'light' ? 'light' : 'dark',
  )
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(`cmdb-theme:${userId}`, theme)
    return () => {
      delete document.documentElement.dataset.theme
    }
  }, [theme, userId])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'light'}
      aria-label={theme === 'dark' ? 'Activate light mode' : 'Activate dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
      className={`day-night-switch day-night-switch-${theme}`}
    >
      <span className="day-night-switch-icon day-night-switch-moon" aria-hidden="true">
        <Moon size={17} strokeWidth={2.4} />
      </span>
      <span className="day-night-switch-icon day-night-switch-sun" aria-hidden="true">
        <Sun size={17} strokeWidth={2.4} />
      </span>
      <span className="day-night-switch-thumb" aria-hidden="true" />
    </button>
  )
}
