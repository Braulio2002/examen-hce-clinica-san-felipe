'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';

import { useSesion } from './sesion';

/**
 * Navegacion principal, compartida por ambas zonas del microfront.
 *
 * En Multi-Zones el enrutador del cliente no puede cruzar de una zona a otra:
 * hace falta una recarga completa. Por eso un enlace a otra zona debe ser un
 * <a> nativo, y uno dentro de la misma zona un <Link>, que navega al instante.
 *
 * QUE ZONA ES "LA OTRA" DEPENDE DE DONDE SE RENDERICE ESTE COMPONENTE, y ese
 * era el error: la condicion estaba escrita como un dato fijo de cada enlace,
 * desde el punto de vista de la shell. Dentro de la zona de inventario salia
 * mal en las dos direcciones:
 *
 *   - Compras, Ventas y Kardex -que son de la propia zona- se servian como <a>,
 *     asi que moverse entre ellos recargaba la aplicacion entera en vez de
 *     navegar al instante.
 *   - Inicio y Productos -que son de la shell- se servian como <Link>, y Next
 *     les anteponia el basePath: el enlace a /productos apuntaba a
 *     /inventario/productos, que no existe. Devolvia 404, y el prefetch de Next
 *     gastaba una peticion en pedirlo.
 *
 * Ahora la zona se decide comparando la del enlace con la del propio
 * despliegue, que cada aplicacion declara junto a su basePath.
 */

/** Prefijo de la zona de inventario. Debe coincidir con su `basePath`. */
const ZONA_INVENTARIO = '/inventario';

/**
 * Prefijo de la zona en la que corre este componente.
 *
 * Lo declara cada aplicacion en su `next.config.ts`, en el mismo sitio donde
 * define su `basePath`, para que no puedan separarse.
 */
const ZONA_ACTUAL = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Devuelve el prefijo de zona al que pertenece una ruta absoluta. */
function zonaDe(href: string): string {
  return href === ZONA_INVENTARIO || href.startsWith(`${ZONA_INVENTARIO}/`)
    ? ZONA_INVENTARIO
    : '';
}

/**
 * Convierte un enlace absoluto en la ruta que entiende el enrutador de la zona.
 *
 * Next resuelve las rutas de un `<Link>` RELATIVAS al `basePath` de la
 * aplicacion. Dentro del inventario, `/inventario/compras` hay que pasarlo como
 * `/compras`: dejarlo absoluto produciria `/inventario/inventario/compras`.
 *
 * El respaldo a `/` cubre el enlace a la raiz de la propia zona, donde el
 * recorte deja una cadena vacia y Next interpretaria "la URL actual" en lugar
 * de la portada. Hoy ningun enlace del menu es exactamente la raiz de la zona,
 * pero es la clase de detalle que rompe el dia que se anada uno.
 *
 * Se extrae como funcion con nombre por eso mismo: es la unica linea del
 * componente que hace una transformacion no evidente, y asi se puede comprobar
 * por si sola en lugar de solo a traves del arbol renderizado.
 */
export function rutaEnZona(href: string, zonaActual: string = ZONA_ACTUAL): string {
  return href.slice(zonaActual.length) || '/';
}
interface Enlace {
  href: string;
  etiqueta: string;
  icono: React.JSX.Element;
}

const ENLACES: Enlace[] = [
  {
    href: '/',
    etiqueta: 'Inicio',
    icono: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
      />
    ),
  },
  {
    href: '/productos',
    etiqueta: 'Productos',
    icono: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 7.5 12 3 3.75 7.5m16.5 0L12 12m8.25-4.5v9L12 21m0-9L3.75 7.5M12 12v9m-8.25-13.5v9"
      />
    ),
  },
  {
    href: '/inventario/compras',
    etiqueta: 'Compras',
    icono: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
      />
    ),
  },
  {
    href: '/inventario/ventas',
    etiqueta: 'Ventas',
    icono: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12A1.125 1.125 0 0 1 19.75 22H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z"
      />
    ),
  },
  {
    href: '/inventario/kardex',
    etiqueta: 'Kardex',
    icono: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
      />
    ),
  },
];

export function NavegacionPrincipal({
  rutaActual,
}: Readonly<{ rutaActual?: string }>): React.JSX.Element {
  const rutaCliente = usePathname();
  // usePathname devuelve la ruta SIN el basePath de la zona, mientras que los
  // enlaces se declaran en absoluto. Sin recomponerla, dentro de la zona no se
  // marcaba ningun elemento como activo: se comparaba "/kardex" contra
  // "/inventario/kardex".
  const ruta = rutaActual ?? `${ZONA_ACTUAL}${rutaCliente}`;
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
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 2h4v6h6v4h-6v6h-4v-6H4V8h6V2Z" />
            </svg>
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight text-slate-900">
              HCE Insumos
            </span>
            <span className="block text-xs leading-tight text-slate-500">
              Clinica San Felipe
            </span>
          </span>
        </a>

        {/* Navegacion de escritorio */}
        <nav
          aria-label="Navegacion principal"
          className="hidden flex-1 items-center gap-1 lg:flex"
        >
          {ENLACES.map((enlace) =>
            zonaDe(enlace.href) !== ZONA_ACTUAL ? (
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
                href={rutaEnZona(enlace.href)}
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
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
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
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
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
            {/*
              Mismo criterio que en escritorio. Aqui pesa mas: este es el menu
              que se ve por debajo de `lg`, es decir el de las tablets, que son
              el dispositivo de planta. Antes todos los enlaces eran <a>, asi
              que cada cambio de pantalla recargaba la aplicacion entera.
            */}
            {ENLACES.map((enlace) => (
              <li key={enlace.href}>
                {zonaDe(enlace.href) === ZONA_ACTUAL ? (
                  <Link
                    href={rutaEnZona(enlace.href)}
                    aria-current={esActivo(enlace.href) ? 'page' : undefined}
                    className={claseEnlace(esActivo(enlace.href))}
                    onClick={() => setMenuAbierto(false)}
                  >
                    {contenidoEnlace(enlace)}
                  </Link>
                ) : (
                  <a
                    href={enlace.href}
                    aria-current={esActivo(enlace.href) ? 'page' : undefined}
                    className={claseEnlace(esActivo(enlace.href))}
                    onClick={() => setMenuAbierto(false)}
                  >
                    {contenidoEnlace(enlace)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
