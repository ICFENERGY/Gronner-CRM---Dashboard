import { useEffect, useState } from 'react'

const cache = new Map<string, Promise<unknown>>()

function getCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, loader())
  return cache.get(key) as Promise<T>
}

export function useRawData<T>(key: string, loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCached(key, loader)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  function reload() {
    cache.delete(key)
    setVersion((current) => current + 1)
  }

  return { data, error, loading, reload }
}
