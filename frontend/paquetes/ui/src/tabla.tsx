'use client';

import type React from 'react';
import type { ReactNode } from 'react';

/**
 * Contenedor de tabla con desplazamiento horizontal propio.
 * Evita que la pagina completa se desplace en horizontal en tablet.
 */
export function ContenedorTabla({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
