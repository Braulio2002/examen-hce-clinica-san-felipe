'use client';

import type React from 'react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

/**
 * Modal accesible: atrapa el foco, cierra con Escape y lo devuelve al salir.
 *
 * En un entorno clinico el teclado suele ser el dispositivo principal, asi que
 * el recorrido del foco no es un adorno.
 */

export interface PropsModal {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'md' | 'lg' | 'xl';
}

export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  pie,
  ancho = 'lg',
}: Readonly<PropsModal>): React.JSX.Element | null {
  const contenedor = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!abierto) return;

    const alPulsarTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') {
        onCerrar();
        return;
      }
      // Atrapa el foco dentro del modal: Tab no debe llevar al fondo de pagina.
      if (evento.key === 'Tab' && contenedor.current) {
        const enfocables = contenedor.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (enfocables.length === 0) return;

        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];

        if (evento.shiftKey && document.activeElement === primero) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primero.focus();
        }
      }
    };

    document.addEventListener('keydown', alPulsarTecla);
    const desbordeOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Se recuerda quien abrio el modal para devolverle el foco al cerrarlo.
    const disparador = document.activeElement;

    // Lleva el foco al primer control del modal al abrirse.
    const temporizador = window.setTimeout(() => {
      contenedor.current
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), select, textarea',
        )
        ?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', alPulsarTecla);
      document.body.style.overflow = desbordeOriginal;
      window.clearTimeout(temporizador);

      // Sin esto el foco cae al principio del documento y quien navega con
      // teclado pierde su posicion: acaba de pulsar "Ver" en la fila 30 del
      // Kardex y al cerrar tiene que recorrer la tabla entera otra vez. Es el
      // requisito 2.4.3 de las WCAG, y aqui pesa mas de lo habitual porque en
      // planta el teclado suele ser el dispositivo principal.
      //
      // Se comprueba que el elemento siga en el documento: si el modal se cerro
      // porque la fila que lo abrio desaparecio, devolver el foco a un nodo
      // huerfano no hace nada y el navegador lo manda al body igualmente.
      if (
        disparador instanceof HTMLElement &&
        disparador.isConnected &&
        typeof disparador.focus === 'function'
      ) {
        disparador.focus();
      }
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const anchos = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="presentation">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onCerrar}
        aria-hidden="true"
      />
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          ref={contenedor}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          className={[
            'relative w-full rounded-t-2xl bg-white shadow-xl sm:rounded-2xl',
            anchos[ancho],
          ].join(' ')}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id={idTitulo} className="text-lg font-semibold text-slate-900">
                {titulo}
              </h2>
              {descripcion && (
                <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="-mr-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

          {pie && (
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              {pie}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
