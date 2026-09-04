'use client';

import type React from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

/**
 * Componentes de interfaz compartidos por las zonas del microfront.
 *
 * Viven en un paquete propio para que la shell y la zona de inventario se vean
 * como una sola aplicacion aunque se construyan y desplieguen por separado. Es
 * el equivalente al "design system" de un microfront real.
 *
 * Accesibilidad: los componentes interactivos declaran roles y atributos ARIA,
 * y el modal atrapa el foco. En un entorno clinico el teclado suele ser el
 * dispositivo principal, y el personal trabaja con guantes sobre tablets.
 */

/* ---------------------------------------------------------------------------
   Boton
   --------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   Campo de formulario
   --------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   Modal accesible
   --------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   Mensajes y estados
   --------------------------------------------------------------------------- */
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

/** Etiqueta de estado del stock, con semantica de color para farmacia. */
/** Umbral operativo por debajo del cual farmacia debe reponer. */
const STOCK_BAJO = 20;

/**
 * Estado visual del stock.
 *
 * Se expresa como funcion con salidas tempranas y no como ternario anidado: los
 * tres tramos son una regla operativa de farmacia, y leerlos en vertical hace
 * evidente donde esta cada umbral.
 */
function estadoDelStock(stock: number): { texto: string; clases: string } {
  if (stock <= 0) {
    return { texto: 'Sin stock', clases: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
  }
  if (stock <= STOCK_BAJO) {
    return {
      texto: `${stock} (bajo)`,
      clases: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    };
  }
  return {
    texto: String(stock),
    clases: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  };
}

export function EtiquetaStock({ stock }: Readonly<{ stock: number }>): React.JSX.Element {
  const { texto, clases } = estadoDelStock(stock);

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${clases}`}
    >
      {texto}
    </span>
  );
}

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
