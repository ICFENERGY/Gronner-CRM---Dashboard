import { useState } from 'react'
import type { FunilResumo } from '../api/types'

function FunilRow({ funil, maxQuantidade }: { funil: FunilResumo; maxQuantidade: number }) {
  const [open, setOpen] = useState(false)
  const largura = maxQuantidade ? Math.max((funil.quantidade / maxQuantidade) * 100, funil.quantidade > 0 ? 2 : 0) : 0
  const etapasComDados = funil.etapas.filter((e) => e.quantidade > 0)

  return (
    <div className="border-t border-slate-800 first:border-t-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-800/30"
      >
        <span className="w-56 shrink-0 truncate text-sm text-slate-200">{funil.funil}</span>
        <span className="relative h-4 flex-1 overflow-hidden rounded bg-slate-800">
          <span
            className="absolute inset-y-0 left-0 rounded"
            style={{ width: `${largura}%`, backgroundColor: funil.cor }}
          />
        </span>
        <span className="w-12 shrink-0 text-right text-sm font-medium text-slate-200">{funil.quantidade}</span>
        <span className="w-4 shrink-0 text-slate-500">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="ml-56 mb-3 rounded-lg bg-slate-950/60 p-3">
          {etapasComDados.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum projeto nesta etapa no momento.</p>
          ) : (
            <ul className="space-y-1">
              {etapasComDados.map((e) => (
                <li key={e.etapa} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{e.etapa}</span>
                  <span className="font-medium text-slate-300">{e.quantidade}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function FunilPipeline({ data }: { data: FunilResumo[] }) {
  const maxQuantidade = Math.max(...data.map((f) => f.quantidade), 1)
  const cadeiaPrincipal = data.filter((f) => f.cadeiaPrincipal)
  const paralelos = data.filter((f) => !f.cadeiaPrincipal)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-sm font-medium text-slate-300">Funil de vendas — Groner CRM</h3>
      <p className="mb-4 text-xs text-slate-500">
        Estrutura oficial dos funis e etapas (cadeia principal do lead ao pós-venda + processos paralelos). Clique num
        funil para ver a distribuição por etapa.
      </p>

      <div className="mb-5">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Cadeia principal — do lead ao pós-venda (funis 01–17)
        </p>
        {cadeiaPrincipal.map((f) => (
          <FunilRow key={f.funil} funil={f} maxQuantidade={maxQuantidade} />
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Processos paralelos</p>
        {paralelos.map((f) => (
          <FunilRow key={f.funil} funil={f} maxQuantidade={maxQuantidade} />
        ))}
      </div>
    </div>
  )
}
