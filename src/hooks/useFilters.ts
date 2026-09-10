import { useState } from 'react'

export function useFilters() {
  const [values, setValues] = useState<Record<string, string>>({})
  const onChange = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }))
  const onClear = () => setValues({})
  return { values, onChange, onClear }
}

export function matches(value: string | null | undefined, filtro: string | undefined) {
  if (!filtro) return true
  return (value ?? '').toLowerCase() === filtro.toLowerCase()
}

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
