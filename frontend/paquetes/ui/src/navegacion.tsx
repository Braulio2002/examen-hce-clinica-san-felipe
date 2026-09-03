'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

import { useSesion } from './sesion';

/**
 * Navegacion principal, compartida por ambas zonas del microfront.
 *
 * Los enlaces hacia /inventario/* son <a> nativos y no <Link> de Next: apuntan
 * a otra aplicacion, y el enrutador del cliente no puede navegar a una zona
 * distinta sin una recarga completa. Es el compromiso conocido del patron
 * Multi-Zones: navegacion instantanea dentro de cada zona, recarga al cruzar
 * de una a otra.
 */
interface Enlace {
  href: string;
  etiqueta: string;
  zonaExterna: boolean;
  icono: React.JSX.Element;
}

const ENLACES: Enlace[] = [
  {
    href: '/',
    etiqueta: 'Inicio',
    zonaExterna: false,
    icono: (
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    ),
  },
  {
    href: '/productos',
    etiqueta: 'Productos',
    zonaExterna: false,
    icono: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5 12 3 3.75 7.5m16.5 0L12 12m8.25-4.5v9L12 21m0-9L3.75 7.5M12 12v9m-8.25-13.5v9" />
    ),
  },
  {
    href: '/inventario/compras',
    etiqueta: 'Compras',
    zonaExterna: true,
    icono: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    ),
  },
  {
    href: '/inventario/ventas',
    etiqueta: 'Ventas',
    zonaExterna: true,
    icono: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 22H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />
    ),
  },
  {
    href: '/inventario/kardex',
    etiqueta: 'Kardex',
    zonaExterna: true,
    icono: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    ),
  },
];

export function NavegacionPrincipal({ rutaActual }: { rutaActual?: string }): React.JSX.Element {
  const rutaCliente = usePathname();
  const ruta = rutaActual ?? rutaCliente ?? '/';
  const { usuario, cerrarSesion } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const esActivo = (href: string): boolean =>
    href === '/' ? ruta === '/' : ruta.startsWith(href);

  const claseEnlace = (activo: boolean): string =>
    [
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      activo
        ? 'bg-clinica-50 text-clinica-800'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    ].join(' ');

  const contenidoEnlace = (enlace: Enlace): React.JSX.Element => (
    <>
      <svg
        className="h-5 w-5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        {enlace.icono}
      </svg>
      {enlace.etiqueta}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-clinica-600 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 2h4v6h6v4h-6v6h-4v-6H4V8h6V2Z" />
            </svg>
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight text-slate-900">
              HCE Insumos
            </span>
            <span className="block text-xs leading-tight text-slate-500">Clinica San Felipe</span>
          </span>
        </a>

        {/* Navegacion de escritorio */}
        <nav aria-label="Navegacion principal" className="hidden flex-1 items-center gap-1 lg:flex">
          {ENLACES.map((enlace) =>
            enlace.zonaExterna ? (
              <a
                key={enlace.href}
                href={enlace.href}
                aria-current={esActivo(enlace.href) ? 'page' : undefined}
                className={claseEnlace(esActivo(enlace.href))}
              >
                {contenidoEnlace(enlace)}
              </a>
            ) : (
              <Link
                key={enlace.href}
                href={enlace.href}
                aria-current={esActivo(enlace.href) ? 'page' : undefined}
                className={claseEnlace(esActivo(enlace.href))}
              >
                {contenidoEnlace(enlace)}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {usuario && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">
                {usuario.nombreCompleto}
              </p>
              <p className="text-xs leading-tight text-slate-500">{usuario.rol}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void cerrarSesion()}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar sesion"
            title="Cerrar sesion"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-expanded={menuAbierto}
            aria-controls="menu-movil"
            aria-label="Abrir menu de navegacion"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Navegacion movil y tablet en vertical */}
      {menuAbierto && (
        <nav
          id="menu-movil"
          aria-label="Navegacion principal"
          className="border-t border-slate-200 bg-white px-4 py-2 lg:hidden"
        >
          <ul className="space-y-1">
            {ENLACES.map((enlace) => (
              <li key={enlace.href}>
                <a
                  href={enlace.href}
                  aria-current={esActivo(enlace.href) ? 'page' : undefined}
                  className={claseEnlace(esActivo(enlace.href))}
                  onClick={() => setMenuAbierto(false)}
                >
                  {contenidoEnlace(enlace)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
