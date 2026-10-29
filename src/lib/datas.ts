/**
 * Data curta (dd/mm/aaaa) para exibição. "AAAA-MM-DD" sem hora é data de calendário: formata direto do texto,
 * porque `new Date('2026-04-09')` é meia-noite UTC e no fuso de Brasília apareceria como 08/04.
 * Com hora, converte para Brasília.
 */
export function dataCurtaBr(valor: string | null | undefined): string {
  if (!valor) return '—'
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
