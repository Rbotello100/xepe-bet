import type { ReactNode } from 'react'

/**
 * Shell de 3 columnas para todas las vistas.
 * Composicion: cada page resuelve su data y pasa los slots `left` y `right`,
 * y el contenido central como children. El Header va fuera del AppShell.
 *
 * Responsive:
 *   - >=1180px: 316px / 1fr / 340px
 *   - >=1020px y <1180px: 270px / 1fr / 300px
 *   - <1020px: 1 columna (orden DOM: izquierda -> centro -> derecha)
 */
export function AppShell({
  left,
  right,
  children,
}: {
  left: ReactNode
  right: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="
        mx-auto grid max-w-[1500px] items-start gap-5 px-6 pb-16 pt-[22px]
        grid-cols-1
        min-[1020px]:grid-cols-[270px_minmax(0,1fr)_300px]
        min-[1180px]:grid-cols-[316px_minmax(0,1fr)_340px]
      "
    >
      {/* Columna izquierda: sticky en >=lg */}
      <div className="flex flex-col gap-4 min-[1020px]:sticky min-[1020px]:top-[84px]">
        {left}
      </div>
      {/* Columna central */}
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      {/* Columna derecha: sticky en >=lg */}
      <div className="flex flex-col gap-4 min-[1020px]:sticky min-[1020px]:top-[84px]">
        {right}
      </div>
    </div>
  )
}
