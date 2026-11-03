import { api } from '../api/client'
import { useRawData } from '../api/useRawData'
import { MapaUsinas } from '../features/solarz/MapaUsinas'

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
const hojeBrasilia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

export function MonitoramentoSolarPage() {
  const { data, loading, error } = useRawData('usinas', api.getUsinasRaw)
  if (loading) return <p className="p-10 text-center text-[var(--text-secondary)]">Carregando usinas…</p>
  if (error) return <p className="p-10 text-center text-red-600 dark:text-red-400">{error}</p>
  if (!data) return null
  return <MapaUsinas resposta={data} hoje={hojeBrasilia()} />
}
