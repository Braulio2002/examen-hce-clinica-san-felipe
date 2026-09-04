'use client';

import type React from 'react';
import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

/**
 * Campo de formulario con etiqueta, ayuda y error enlazados.
 *
 * El identificador se genera con `useId` para que `htmlFor` y `aria-describedby`
 * apunten al elemento correcto aunque haya varias instancias en la pantalla.
 */

export interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  error?: string;
  ayuda?: string;
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  className = '',
  id,
  ...resto
}: Readonly<PropsCampo>): React.JSX.Element {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idError = `${idCampo}-error`;
  const idAyuda = `${idCampo}-ayuda`;

  /*
   * El texto de apoyo se resuelve antes del JSX en lugar de encadenar dos
   * ternarios dentro del marcado: `error ? idError : ayuda ? idAyuda : undefined`
   * obliga a leer tres ramas en una linea justo donde importa la accesibilidad.
   */
  let idDescripcion: string | undefined;
  if (error) {
    idDescripcion = idError;
  } else if (ayuda) {
    idDescripcion = idAyuda;
  }

  return (
    <div className="w-full">
      <label
        htmlFor={idCampo}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {etiqueta}
      </label>
      <input
        id={idCampo}
        // Enlaza el mensaje de error con el campo para los lectores de pantalla.
        aria-invalid={error ? true : undefined}
        aria-describedby={idDescripcion}
        className={[
          'block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 shadow-sm',
          'ring-1 ring-inset placeholder:text-slate-400',
          'focus:ring-2 focus:ring-inset focus:ring-clinica-600',
          'disabled:bg-slate-50 disabled:text-slate-500',
          error ? 'ring-rose-500' : 'ring-slate-300',
          className,
        ].join(' ')}
        {...resto}
      />
      {error && (
        <p id={idError} role="alert" className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      )}
      {!error && ayuda && (
        <p id={idAyuda} className="mt-1.5 text-sm text-slate-500">
          {ayuda}
        </p>
      )}
    </div>
  );
}
