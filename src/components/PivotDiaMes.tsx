import { number } from '../lib/palette'

export interface ItemComData {
  dataInclusao: string
}

const MESES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function PivotDiaMes({ title, items }: { title: string; items: ItemComData[] }) {
  const mesesPresentes = [...new Set(items.map((i) => Number(i.dataInclusao.slice(5, 7)) - 1))].sort((a, b) => a - b)
  const matriz = new Map<number, Map<number, number>>()
  const totalPorDia = new Map<number, number>()
  const totalPorMes = new Map<number, number>()
  let totalGeral = 0

  for (const item of items) {
    const dia = Number(item.dataInclusao.slice(8, 10))
    const mes = Number(item.dataInclusao.slice(5, 7)) - 1
    if (!matriz.has(dia)) matriz.set(dia, new Map())
    const linha = matriz.get(dia)!
    linha.set(mes, (linha.get(mes) ?? 0) + 1)
    totalPorDia.set(dia, (totalPorDia.get(dia) ?? 0) + 1)
    totalPorMes.set(mes, (totalPorMes.get(mes) ?? 0) + 1)
    totalGeral += 1
  }

  const diasOrdenados = [...matriz.keys()].sort((a, b) => a - b)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      <div className="overflow-auto" style={{ maxHeight: 340 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-solid)]">
            <tr className="text-left text-[var(--text-muted)]">
              <th className="pb-2 pr-2 font-normal">Dia</th>
              {mesesPresentes.map((m) => (
                <th key={m} className="pb-2 pr-2 text-right font-normal">
                  {MESES_LABEL[m]}
                </th>
              ))}
              <th className="pb-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {diasOrdenados.map((dia) => (
              <tr key={dia} className="border-t border-[var(--border)]">
                <td className="py-1 pr-2 text-[var(--text-secondary)]">{dia}</td>
                {mesesPresentes.map((m) => (
                  <td key={m} className="py-1 pr-2 text-right text-[var(--text-secondary)]">
                    {matriz.get(dia)?.get(m) ?? ''}
                  </td>
                ))}
                <td className="py-1 text-right font-medium text-[var(--text-primary)]">{totalPorDia.get(dia)}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--border-strong)] font-medium text-[var(--text-primary)]">
              <td className="py-1 pr-2">Total</td>
              {mesesPresentes.map((m) => (
                <td key={m} className="py-1 pr-2 text-right">
                  {number.format(totalPorMes.get(m) ?? 0)}
                </td>
              ))}
              <td className="py-1 text-right">{number.format(totalGeral)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
