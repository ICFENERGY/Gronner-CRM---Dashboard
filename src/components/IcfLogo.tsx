import { ICF_BOLT, ICF_ENERGY, ICF_HEX, ICF_ICF, ICF_VB, ICF_W } from './icfLogoPaths'

/**
 * Logo da ICF Energy em vetor (hexágono verde com raio, "ICF" e "ENERGY").
 * Texto e raio seguem a cor do tema (--text-primary): branco no escuro, azul profundo no claro.
 * Arquivos estáticos equivalentes: public/icf-logo.svg, icf-logo-claro.svg e icf-icone.svg.
 */
export function IcfLogo({ height = 36, className }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox={ICF_VB}
      width={Math.round((ICF_W / 80) * height)}
      height={height}
      role="img"
      aria-label="ICF Energy"
      className={className}
    >
      <path d={ICF_HEX} fill="none" stroke="#01C38E" strokeWidth="7.5" strokeLinejoin="round" />
      <path d={ICF_BOLT} fill="var(--text-primary)" />
      <path d={ICF_ICF} fill="var(--text-primary)" />
      <path d={ICF_ENERGY} fill="var(--text-primary)" />
    </svg>
  )
}
