const SENSITIVE_KEY = /senha|password|token|secret|accessToken/i

/**
 * Remove recursivamente qualquer campo que pareça credencial (senha, token, etc).
 * Defesa extra: alguns recursos do Groner (ex.: PreProposta) embutem o objeto
 * completo do usuário vendedor, incluindo hash de senha e token de outra
 * integração (PlugChat). Isso nunca deve chegar ao navegador.
 */
export function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue
      out[key] = stripSensitive(val)
    }
    return out
  }
  return value
}
