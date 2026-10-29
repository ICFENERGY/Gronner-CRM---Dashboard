import { useMemo, useState } from 'react'
import type { VendaRaw } from '../../../api/types'
import { DataTable } from '../../../components/DataTable'
import { DetailRow, Modal } from '../../../components/Modal'
import { FilterBar, type FilterDef } from '../../../components/FilterBar'
import { useFilters, uniqueSorted } from '../../../hooks/useFilters'
import { currency, number } from '../../../lib/palette'

const diaBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/**
 * Listas de detalhe da aba Vendas: as vendas do período e do vendedor
 * escolhidos no cabeçalho, com recorte extra por origem e estado e busca.
 */
export function DetalheVendas({ vendas }: { vendas: VendaRaw[] }) {
  const { values, onChange, onClear } = useFilters()
  const [busca, setBusca] = useState('')
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaRaw | null>(null)
  const [grupoSelecionado, setGrupoSelecionado] = useState<{ titulo: string; vendas: VendaRaw[] } | null>(null)

  const filtros: FilterDef[] = useMemo(() => [
    { key: 'origemNome', label: 'Origem', options: uniqueSorted(vendas.map((v) => v.origemNome)) },
    { key: 'estado', label: 'Estado', options: uniqueSorted(vendas.map((v) => v.estado)) },
  ], [vendas])

  const filtradas = useMemo(() => vendas.filter((v) => {
    if (values.origemNome && v.origemNome !== values.origemNome) return false
    if (values.estado && v.estado !== values.estado) return false
    if (busca && !v.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  }), [vendas, values, busca])

  const porCidade = new Map<string, { cidade: string; estado: string; quantidade: number; valorTotal: number; vendas: VendaRaw[] }>()
  const porDia = new Map<string, { dia: string; quantidade: number; valorTotal: number; vendas: VendaRaw[] }>()
  for (const v of filtradas) {
    const cidade = v.cidade ?? 'Não informado'
    const chave = `${cidade}/${v.estado ?? ''}`
    const c = porCidade.get(chave) ?? { cidade, estado: v.estado ?? '—', quantidade: 0, valorTotal: 0, vendas: [] }
    c.quantidade += 1
    c.valorTotal += v.valorTotal
    c.vendas.push(v)
    porCidade.set(chave, c)
    const dia = v.dataVenda?.slice(0, 10) ?? '—'
    const d = porDia.get(dia) ?? { dia, quantidade: 0, valorTotal: 0, vendas: [] }
    d.quantidade += 1
    d.valorTotal += v.valorTotal
    d.vendas.push(v)
    porDia.set(dia, d)
  }
  const cidades = [...porCidade.values()].sort((a, b) => b.valorTotal - a.valorTotal).slice(0, 15)
  const dias = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1"><FilterBar filters={filtros} values={values} onChange={onChange} onClear={onClear} /></div>
      </div>
      <div className="-mt-4 max-w-xs">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do cliente…"
          aria-label="Buscar por nome do cliente"
          className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-icf-green focus:outline-none"
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">Nenhuma venda no período e nos filtros escolhidos.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DataTable
              title="Extrato das vendas"
              rows={filtradas.slice().sort((a, b) => (b.dataVenda ?? '').localeCompare(a.dataVenda ?? ''))}
              maxHeight={320}
              onRowClick={setVendaSelecionada}
              columns={[
                { key: 'data', label: 'Data', render: (r) => (r.dataVenda ? diaBr(r.dataVenda) : '—') },
                { key: 'nome', label: 'Cliente', render: (r) => r.nome },
                { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor },
                { key: 'valorTotal', label: 'Valor (R$)', align: 'right', render: (r) => currency.format(r.valorTotal) },
              ]}
            />
            <DataTable
              title="Vendas por dia"
              rows={dias}
              maxHeight={320}
              onRowClick={(r) => setGrupoSelecionado({ titulo: diaBr(r.dia), vendas: r.vendas })}
              columns={[
                { key: 'dia', label: 'Dia', render: (r) => diaBr(r.dia) },
                { key: 'quantidade', label: 'Vendas (qtd.)', align: 'right', render: (r) => number.format(r.quantidade) },
                { key: 'valorTotal', label: 'Valor (R$)', align: 'right', render: (r) => currency.format(r.valorTotal) },
              ]}
            />
          </div>
          <DataTable
            title="Cidades com mais valor vendido"
            rows={cidades}
            maxHeight={320}
            onRowClick={(r) => setGrupoSelecionado({ titulo: `${r.cidade} / ${r.estado}`, vendas: r.vendas })}
            columns={[
              { key: 'cidade', label: 'Cidade', render: (r) => `${r.cidade} / ${r.estado}` },
              { key: 'quantidade', label: 'Vendas (qtd.)', align: 'right', render: (r) => number.format(r.quantidade) },
              { key: 'valorTotal', label: 'Valor (R$)', align: 'right', render: (r) => currency.format(r.valorTotal) },
            ]}
          />
        </>
      )}

      {vendaSelecionada && (
        <Modal title={vendaSelecionada.nome} onClose={() => setVendaSelecionada(null)}>
          <DetailRow label="Vendedor" value={vendaSelecionada.vendedor} />
          <DetailRow label="Valor total" value={currency.format(vendaSelecionada.valorTotal)} />
          <DetailRow label="Comissão" value={currency.format(vendaSelecionada.valorComissao)} />
          <DetailRow label="Data da venda" value={vendaSelecionada.dataVenda ? diaBr(vendaSelecionada.dataVenda) : '—'} />
          <DetailRow label="Ciclo de venda" value={vendaSelecionada.cicloVenda != null ? `${Math.round(vendaSelecionada.cicloVenda)} dias` : '—'} />
          <DetailRow label="Origem" value={vendaSelecionada.origemNome} />
          <DetailRow label="Status" value={vendaSelecionada.statusNome} />
          <DetailRow label="Cidade/UF" value={vendaSelecionada.cidade ? `${vendaSelecionada.cidade}/${vendaSelecionada.estado}` : '—'} />
          <DetailRow label="Bairro" value={vendaSelecionada.bairro} />
          <DetailRow label="Fornecedor do kit" value={vendaSelecionada.fornecedor} />
          <DetailRow label="Placa" value={vendaSelecionada.placa} />
          <DetailRow label="Inversor" value={vendaSelecionada.inversor} />
          <DetailRow label="Lucro" value={vendaSelecionada.lucro != null ? currency.format(vendaSelecionada.lucro) : '—'} />
        </Modal>
      )}

      {grupoSelecionado && (
        <Modal title={grupoSelecionado.titulo} onClose={() => setGrupoSelecionado(null)}>
          <DataTable
            title={`${grupoSelecionado.vendas.length} venda(s)`}
            rows={grupoSelecionado.vendas}
            maxHeight={400}
            onRowClick={(v) => { setGrupoSelecionado(null); setVendaSelecionada(v) }}
            columns={[
              { key: 'nome', label: 'Cliente', render: (r) => r.nome },
              { key: 'vendedor', label: 'Vendedor', render: (r) => r.vendedor },
              { key: 'valorTotal', label: 'Valor (R$)', align: 'right', render: (r) => currency.format(r.valorTotal) },
            ]}
          />
        </Modal>
      )}
    </div>
  )
}
