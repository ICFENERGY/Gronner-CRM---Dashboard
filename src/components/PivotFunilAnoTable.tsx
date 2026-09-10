import type { PivotFunilAno } from '../api/types'
import { number } from '../lib/palette'

export function PivotFunilAnoTable({ data }: { data: PivotFunilAno }) {
  const totalPorAno = data.anos.map((_, i) => data.linhas.reduce((s, l) => s + (l.porAno[i] ?? 0), 0))
  const totalGeral = data.linhas.reduce((s, l) => s + l.total, 0)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-1 text-sm font-medium text-slate-300">Contagem de código — Funil x Ano de cadastro</h3>
      <p className="mb-3 text-xs text-slate-500">Mesmo formato da aba "Resumo" do export do Groner, com dados ao vivo da API.</p>
      <div className="overflow-auto" style={{ maxHeight: 420 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900">
            <tr className="text-left text-slate-500">
              <th className="pb-2 pr-3 font-normal">Funil</th>
              {data.anos.map((ano) => (
                <th key={ano} className="pb-2 pr-3 text-right font-normal">
                  {ano}
                </th>
              ))}
              <th className="pb-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.linhas.map((linha) => (
              <tr key={linha.funil} className="border-t border-slate-800">
                <td className="py-1.5 pr-3">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ backgroundColor: linha.cor }} />
                  <span className="text-slate-300">{linha.funil}</span>
                </td>
                {linha.porAno.map((v, i) => (
                  <td key={i} className="py-1.5 pr-3 text-right text-slate-400">
                    {v || ''}
                  </td>
                ))}
                <td className="py-1.5 text-right font-medium text-slate-200">{number.format(linha.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-700 font-medium text-slate-200">
              <td className="py-1.5 pr-3">Total geral</td>
              {totalPorAno.map((v, i) => (
                <td key={i} className="py-1.5 pr-3 text-right">
                  {number.format(v)}
                </td>
              ))}
              <td className="py-1.5 text-right">{number.format(totalGeral)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
