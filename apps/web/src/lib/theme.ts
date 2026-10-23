import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'ravex-theme'
const listeners = new Set<() => void>()

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let current: ThemeChoice = typeof window === 'undefined' ? 'system' : read()

/** `data-theme` pins a theme; without it the CSS follows the OS (prefers-color-scheme). */
function apply(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export function setTheme(choice: ThemeChoice): void {
  current = choice
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  apply(choice)
  listeners.forEach((l) => l())
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
  return [choice, setTheme]
}

/** Whether dark is currently showing (pinned, or following a dark OS). */
export function useIsDark(): boolean {
  const [choice] = useTheme()
  const osDark = useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', l)
      return () => mq.removeEventListener('change', l)
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  return choice === 'dark' || (choice === 'system' && osDark)
}
