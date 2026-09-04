'use client';

import type React from 'react';

import { NavegacionPrincipal } from './navegacion';
import { Cargador } from './retroalimentacion';
import { useSesion } from './sesion';

/**
 * Marco comun de las pantallas autenticadas: cabecera, navegacion y contenedor.
 *
 * Mientras se resuelve el perfil se muestra un indicador en lugar del contenido,
 * para no renderizar una pantalla vacia que luego cambie de golpe.
 */
export function MarcoAplicacion({
  titulo,
  descripcion,
  acciones,
  children,
}: Readonly<{
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}>): React.JSX.Element {
  const { cargando } = useSesion();

  return (
    <div className="min-h-screen">
      <NavegacionPrincipal />

      <main
        id="contenido"
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {titulo}
            </h1>
            {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
          </div>
          {acciones && <div className="flex shrink-0 gap-2">{acciones}</div>}
        </div>

        {cargando ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Cargador className="h-8 w-8" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
