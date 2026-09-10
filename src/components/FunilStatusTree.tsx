import { useState } from 'react'
import { gronerFunis } from '../../shared/gronerFunis.js'
import { number } from '../lib/palette'

function normalize(nome: string) {
  return nome
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const canonicalLookup = new Map<string, string>(gronerFunis.funilOrdem.map((nome: string) => [normalize(nome), nome]))

interface Item {
  funil: string | null
  etapa: string | null
}

export function FunilStatusTree({ title, items }: { title: string; items: Item[] }) {
  const [aberto, setAberto] = useState<string | null>(null)

  const porFunil = new Map<string, Map<string, number>>()
  for (const item of items) {
    const bruto = item.funil || 'Sem funil'
    const canonico = canonicalLookup.get(normalize(bruto)) ?? bruto
    if (!porFunil.has(canonico)) porFunil.set(canonico, new Map())
    const etapas = porFunil.get(canonico)!
    const etapaNome = item.etapa || 'Sem etapa'
    etapas.set(etapaNome, (etapas.get(etapaNome) ?? 0) + 1)
  }

  const ordemCanonica: string[] = gronerFunis.funilOrdem
  const linhas = [...porFunil.entries()].sort((a, b) => {
    const ia = ordemCanonica.indexOf(a[0])
    const ib = ordemCanonica.indexOf(b[0])
    if (ia === -1 && ib === -1) return b[1].size - a[1].size
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="mb-3 text-sm font-medium text-slate-300">{title}</h3>
      <div className="overflow-auto" style={{ maxHeight: 340 }}>
        {linhas.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-500">Sem dados para os filtros selecionados.</p>
        ) : (
          linhas.map(([funil, etapas]) => {
            const total = [...etapas.values()].reduce((s, v) => s + v, 0)
            const isOpen = aberto === funil
            return (
              <div key={funil} className="border-t border-slate-800 first:border-t-0">
                <button
                  onClick={() => setAberto(isOpen ? null : funil)}
                  className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-slate-800/30"
                >
                  <span className="text-slate-200">{funil}</span>
                  <span className="flex items-center gap-2 text-slate-400">
                    {number.format(total)}
                    <span className="text-slate-600">{isOpen ? '−' : '+'}</span>
                  </span>
                </button>
                {isOpen && (
                  <ul className="mb-2 ml-3 space-y-1 border-l border-slate-800 pl-3">
                    {[...etapas.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([etapa, qtd]) => (
                        <li key={etapa} className="flex justify-between text-xs">
                          <span className="text-slate-400">{etapa}</span>
                          <span className="text-slate-300">{qtd}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
