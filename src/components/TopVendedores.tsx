import type { VendedorResumo } from '../api/types'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function TopVendedores({ data }: { data: VendedorResumo[] }) {
  const top = data.slice(0, 8)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-4 text-sm font-medium text-slate-300">Ranking de vendedores</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-2 font-normal">Vendedor</th>
            <th className="pb-2 font-normal text-right">Vendas</th>
            <th className="pb-2 font-normal text-right">Valor total</th>
          </tr>
        </thead>
        <tbody>
          {top.map((v) => (
            <tr key={v.vendedor} className="border-t border-slate-800">
              <td className="py-2 text-slate-200">{v.vendedor}</td>
              <td className="py-2 text-right text-slate-400">{v.quantidade}</td>
              <td className="py-2 text-right font-medium text-icf-greenLight">{currency.format(v.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
