import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'groner-dashboard-theme'

function aplicarTema(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY)
      if (salvo === 'light' || salvo === 'dark') return salvo
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com o padrão.
    }
    return 'light'
  })

  useEffect(() => {
    aplicarTema(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignora falha ao persistir
    }
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggleTheme }
}
