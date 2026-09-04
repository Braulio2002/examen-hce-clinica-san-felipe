'use client';

import type React from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Cargador } from './retroalimentacion';

/**
 * Boton compartido por las zonas del microfront.
 *
 * Deshabilita el control mientras `cargando` esta activo: es lo que impide
 * registrar dos veces la misma compra o venta con un doble clic.
 */

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'fantasma';
type TamanoBoton = 'sm' | 'md' | 'lg';

const ESTILOS_VARIANTE: Record<VarianteBoton, string> = {
  primario:
    'bg-clinica-600 text-white hover:bg-clinica-700 focus-visible:outline-clinica-600 shadow-sm',
  secundario:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  peligro:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-sm',
  fantasma:
    'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-slate-400',
};

const ESTILOS_TAMANO: Record<TamanoBoton, string> = {
  // Altura minima de 44 px: objetivo tactil comodo en tablet.
  sm: 'min-h-[36px] px-3 text-sm gap-1.5',
  md: 'min-h-[44px] px-4 text-sm gap-2',
  lg: 'min-h-[48px] px-5 text-base gap-2',
};

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  cargando?: boolean;
  iconoIzquierda?: ReactNode;
}

export function Boton({
  variante = 'primario',
  tamano = 'md',
  cargando = false,
  iconoIzquierda,
  children,
  className = '',
  disabled,
  ...resto
}: Readonly<PropsBoton>): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={(disabled ?? false) || cargando}
      aria-busy={cargando || undefined}
      className={[
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ESTILOS_VARIANTE[variante],
        ESTILOS_TAMANO[tamano],
        className,
      ].join(' ')}
      {...resto}
    >
      {cargando ? <Cargador className="h-4 w-4" /> : iconoIzquierda}
      {children}
    </button>
  );
}
