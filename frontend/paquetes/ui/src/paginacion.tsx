'use client';

import type React from 'react';

import type { MetaPaginacion } from '@hce/api-cliente';

import { Boton } from './boton';

/**
 * Controles de paginacion, con el rango que se esta viendo.
 *
 * La paginacion se resuelve en el servidor: el procedimiento almacenado aplica
 * OFFSET/FETCH y devuelve `Total_registros` con una funcion de ventana, asi que
 * el navegador solo recibe la pagina pedida. Nunca se trae la tabla entera para
 * cortarla en el cliente, que es lo que deja de funcionar en cuanto el catalogo
 * crece.
 *
 * Estos controles vivian duplicados carACter por carACter en las pantallas de
 * Productos y de Kardex. Ademas se ocultaban cuando solo habia una pagina, y
 * eso tenia un efecto indeseado: con el catalogo de demostracion -trece
 * productos- no aparecian nunca, y daba la impresion de que la paginacion no
 * estaba implementada.
 *
 * Ahora se muestran siempre que haya registros. El rango "Mostrando 1-10 de 13"
 * es lo que hace visible que el corte lo hizo el servidor, y de paso responde a
 * la pregunta que el usuario se hace de verdad: cuantos hay en total.
 */
export function Paginacion({
  meta,
  onCambiarPagina,
  elementos = 'registros',
}: Readonly<{
  meta: MetaPaginacion;
  onCambiarPagina: (pagina: number) => void;
  /** Nombre en plural de lo que se lista: "productos", "articulos". */
  elementos?: string;
}>): React.JSX.Element | null {
  const { pagina, tamanoPagina, totalRegistros, totalPaginas } = meta;

  if (totalRegistros === 0) return null;

  const desde = (pagina - 1) * tamanoPagina + 1;
  const hasta = Math.min(pagina * tamanoPagina, totalRegistros);

  return (
    <nav
      aria-label="Paginacion"
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-slate-500 tabular-nums" aria-live="polite">
        Mostrando{' '}
        <span className="font-medium text-slate-700">
          {desde}-{hasta}
        </span>{' '}
        de <span className="font-medium text-slate-700">{totalRegistros}</span>{' '}
        {elementos}
      </p>

      <div className="flex items-center gap-3">
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={pagina <= 1}
          aria-label="Pagina anterior"
          onClick={() => onCambiarPagina(Math.max(1, pagina - 1))}
        >
          Anterior
        </Boton>

        <span className="text-sm tabular-nums text-slate-500">
          Pagina {pagina} de {totalPaginas}
        </span>

        <Boton
          variante="secundario"
          tamano="sm"
          disabled={pagina >= totalPaginas}
          aria-label="Pagina siguiente"
          onClick={() => onCambiarPagina(Math.min(totalPaginas, pagina + 1))}
        >
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}
