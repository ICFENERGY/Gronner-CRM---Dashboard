import type { VendedorResumo } from '../api/types'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function TopVendedores({ data, onSelect }: { data: VendedorResumo[]; onSelect?: (vendedor: string) => void }) {
  const top = data.slice(0, 8)

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-1 text-sm font-medium text-[var(--text-secondary)]">Ranking de vendedores</h3>
      {onSelect && <p className="mb-3 text-xs text-[var(--text-muted)]">Clique num vendedor para filtrar a página por ele.</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="pb-2 font-normal">Vendedor</th>
            <th className="pb-2 font-normal text-right">Vendas</th>
            <th className="pb-2 font-normal text-right">Valor total</th>
          </tr>
        </thead>
        <tbody>
          {top.map((v) => (
            <tr
              key={v.vendedor}
              onClick={onSelect ? () => onSelect(v.vendedor) : undefined}
              className={`border-t border-[var(--border)] ${onSelect ? 'cursor-pointer hover:bg-[var(--surface-hover)]' : ''}`}
            >
              <td className="py-2 text-[var(--text-primary)]">{v.vendedor}</td>
              <td className="py-2 text-right text-[var(--text-secondary)]">{v.quantidade}</td>
              <td className="py-2 text-right font-medium text-[var(--accent-text)]">{currency.format(v.valorTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
