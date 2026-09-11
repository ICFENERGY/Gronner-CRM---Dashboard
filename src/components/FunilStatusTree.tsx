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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">{title}</h3>
      <div className="overflow-auto" style={{ maxHeight: 340 }}>
        {linhas.length === 0 ? (
          <p className="py-10 text-center text-xs text-[var(--text-muted)]">Sem dados para os filtros selecionados.</p>
        ) : (
          linhas.map(([funil, etapas]) => {
            const total = [...etapas.values()].reduce((s, v) => s + v, 0)
            const isOpen = aberto === funil
            return (
              <div key={funil} className="border-t border-[var(--border)] first:border-t-0">
                <button
                  onClick={() => setAberto(isOpen ? null : funil)}
                  className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-[var(--surface-hover)]"
                >
                  <span className="text-[var(--text-primary)]">{funil}</span>
                  <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    {number.format(total)}
                    <span className="text-[var(--text-muted)]">{isOpen ? '−' : '+'}</span>
                  </span>
                </button>
                {isOpen && (
                  <ul className="mb-2 ml-3 space-y-1 border-l border-[var(--border)] pl-3">
                    {[...etapas.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([etapa, qtd]) => (
                        <li key={etapa} className="flex justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">{etapa}</span>
                          <span className="text-[var(--text-secondary)]">{qtd}</span>
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
