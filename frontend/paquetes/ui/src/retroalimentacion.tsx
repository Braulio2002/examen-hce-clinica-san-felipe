'use client';

import type React from 'react';
import type { ReactNode } from 'react';

/**
 * Lo que la interfaz responde al usuario cuando no hay datos que mostrar:
 * aviso, espera, estado vacio, y la composicion de los tres alrededor de una
 * carga asincrona.
 */

export function Alerta({
  tipo = 'error',
  titulo,
  children,
  onCerrar,
}: Readonly<{
  tipo?: 'error' | 'exito' | 'aviso' | 'info';
  titulo?: string;
  children: ReactNode;
  onCerrar?: () => void;
}>): React.JSX.Element {
  const estilos = {
    error: 'bg-rose-50 text-rose-800 ring-rose-200',
    exito: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    aviso: 'bg-amber-50 text-amber-800 ring-amber-200',
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
  } as const;

  return (
    <div
      // role="alert" hace que el lector de pantalla anuncie el mensaje al aparecer.
      role={tipo === 'error' ? 'alert' : 'status'}
      className={['flex gap-3 rounded-lg p-4 ring-1 ring-inset', estilos[tipo]].join(' ')}
    >
      <div className="flex-1 text-sm">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className={titulo ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Descartar mensaje"
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function Cargador({
  className = 'h-5 w-5',
}: Readonly<{ className?: string }>): React.JSX.Element {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: Readonly<{
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}>): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3">
        <svg
          className="h-6 w-6 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5 12 3 3.75 7.5m16.5 0L12 12m8.25-4.5v9L12 21m0-9L3.75 7.5M12 12v9m-8.25-13.5v9"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-900">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{descripcion}</p>
      )}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

/**
 * Contenido que depende de una carga asincrona.
 *
 * Resuelve en un solo lugar el patron "cargando / error / vacio / datos" que
 * aparece en las cuatro pantallas del sistema. Sustituye a las cadenas de
 * ternarios anidados dentro del JSX, que obligan a leer cuatro ramas en una
 * expresion y son la fuente habitual de estados imposibles: mostrar la tabla
 * vacia mientras aun se esta cargando, o el mensaje de "sin resultados" cuando
 * en realidad hubo un error.
 *
 * El orden de las comprobaciones es deliberado: primero el error, porque un
 * fallo de red con lista vacia debe decir que fallo, no que no hay datos.
 */
export function ContenidoAsincrono({
  cargando,
  error,
  hayDatos,
  vacio,
  children,
  alturaCargador = 'h-7 w-7',
}: Readonly<{
  cargando: boolean;
  error?: string | null;
  hayDatos: boolean;
  /*
   * `vacio` y `children` se declaran como elementos y no como ReactNode para que
   * las cuatro ramas devuelvan el mismo tipo. Devolver a veces un elemento y a
   * veces una cadena obliga a quien consume el componente a comprobar la forma,
   * y no hay ningun sitio donde haga falta pasar texto suelto.
   */
  vacio: React.JSX.Element;
  children: React.JSX.Element;
  alturaCargador?: string;
}>): React.JSX.Element {
  if (cargando) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Cargador className={alturaCargador} />
      </div>
    );
  }

  if (error) {
    return <Alerta tipo="error">{error}</Alerta>;
  }

  if (!hayDatos) {
    return vacio;
  }

  return children;
}
