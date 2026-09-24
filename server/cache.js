const store = new Map()

/** Cache em memória simples com TTL, para evitar reprocessar agregações pesadas a cada request. */
export async function cached(key, ttlMs, loader) {
  const hit = store.get(key)
  const now = Date.now()

  if (hit && hit.expiresAt > now) {
    return hit.value
  }

  const value = await loader()
  store.set(key, { value, expiresAt: now + ttlMs })
  return value
}

export function invalidate(key) {
  store.delete(key)
}
