'use client';

import type React from 'react';

import { calcularImportes, formatearMoneda } from '@hce/api-cliente';
import { Boton, ContenedorTabla, EtiquetaStock } from '@hce/ui';

import type { LineaVenta } from './PantallaVentas';

/**
 * Tabla del detalle de una venta.
 *
 * Muestra precio y stock tal como los devolvio el servidor, y solo deja editar
 * la cantidad: el precio no se teclea porque tampoco se envia.
 *
 * Sobre por que no comparte implementacion con la tabla de compras, ver el
 * comentario de `TablaLineasCompra`.
 */
export function TablaLineasVenta({
  lineas,
  validar,
  onCambiarCantidad,
  onQuitar,
}: Readonly<{
  lineas: readonly LineaVenta[];
  validar: (linea: LineaVenta) => string | null;
  onCambiarCantidad: (idFila: string, valor: string) => void;
  onQuitar: (idFila: string) => void;
}>): React.JSX.Element {
  return (
    <ContenedorTabla>
      <table className="tabla-hce">
        <caption className="sr-only">Detalle de la venta en curso</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col" className="text-right">
              Precio venta
            </th>
            <th scope="col" className="text-right">
              Stock
            </th>
            <th scope="col" className="w-36">
              Cantidad
            </th>
            <th scope="col" className="text-right">
              Subtotal
            </th>
            <th scope="col" className="text-right">
              IGV
            </th>
            <th scope="col" className="text-right">
              Total
            </th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lineas.map((l) => {
            const mensajeError = validar(l);
            const importes = calcularImportes(Number(l.cantidad) || 0, l.precioVenta);
            const idError = `error-${l.idFila}`;

            return (
              <tr key={l.idFila} className={mensajeError ? 'bg-rose-50/60' : undefined}>
                <td>
                  <p className="font-medium text-slate-900">{l.nombreProducto}</p>
                  <p className="text-xs text-slate-500">Lote {l.nroLote}</p>
                </td>
                <td className="text-right tabular-nums">
                  {formatearMoneda(l.precioVenta)}
                </td>
                <td className="text-right">
                  <EtiquetaStock stock={l.stockDisponible} />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={l.stockDisponible}
                    inputMode="numeric"
                    aria-label={`Cantidad de ${l.nombreProducto}`}
                    aria-invalid={mensajeError ? true : undefined}
                    aria-describedby={mensajeError ? idError : undefined}
                    value={l.cantidad}
                    onChange={(e) => onCambiarCantidad(l.idFila, e.target.value)}
                    className={[
                      'w-full min-h-[40px] rounded-lg border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset focus:ring-2',
                      mensajeError
                        ? 'ring-rose-400 focus:ring-rose-500'
                        : 'ring-slate-300 focus:ring-clinica-600',
                    ].join(' ')}
                  />
                  {mensajeError && (
                    <p id={idError} role="alert" className="mt-1 text-xs text-rose-600">
                      {mensajeError}
                    </p>
                  )}
                </td>
                <td className="text-right tabular-nums">
                  {formatearMoneda(importes.subTotal)}
                </td>
                <td className="text-right tabular-nums">
                  {formatearMoneda(importes.igv)}
                </td>
                <td className="text-right font-medium tabular-nums text-slate-900">
                  {formatearMoneda(importes.total)}
                </td>
                <td className="text-right">
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => onQuitar(l.idFila)}
                    aria-label={`Quitar ${l.nombreProducto} de la venta`}
                  >
                    Quitar
                  </Boton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ContenedorTabla>
  );
}
