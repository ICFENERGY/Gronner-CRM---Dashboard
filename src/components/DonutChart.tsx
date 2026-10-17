import { CartaoRosca } from '../features/painel/ui/Rosca'

export interface DonutDatum {
  name: string
  value: number
}

/**
 * Rosca das telas de análise: usa o mesmo componente do painel (máx. 6 fatias,
 * o resto em "Outros", legenda com quantidade e %, tabela alternativa).
 * `maxSlices` ficou só por compatibilidade: o limite é sempre 6.
 * `semaforo` pinta categorias de estado (ok/risco/atrasado) com ícone na legenda.
 */
export function DonutChart({ title, data, semaforo }: { title: string; data: DonutDatum[]; maxSlices?: number; semaforo?: Record<string, 'ok' | 'risco' | 'atrasado'> }) {
  return <CartaoRosca titulo={title} dados={data.map((d) => ({ nome: d.name, valor: d.value }))} semaforo={semaforo} rotuloTotal="total" />
}
