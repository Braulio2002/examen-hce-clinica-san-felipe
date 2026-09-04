'use client';

import type React from 'react';

import { calcularImportes, formatearMoneda } from '@hce/api-cliente';
import { Boton, ContenedorTabla } from '@hce/ui';

import type { LineaCompra } from './PantallaCompras';

/**
 * Tabla del detalle de una compra.
 *
 * No se unifico con la de ventas aunque compartan forma. Las columnas que se
 * editan son distintas -aqui cantidad y costo; alli cantidad contra un stock
 * disponible- y una tabla generica con descriptores de columna resultaria mas
 * dificil de leer que las dos versiones juntas. Compartir tiene sentido cuando
 * la abstraccion existe de verdad, no cuando hay que inventarla.
 *
 * Lo que si se comparte -el calculo de importes, la validacion, el resumen- ya
 * vive en `useLineasDocumento` y en `ResumenTotales`.
 */
export function TablaLineasCompra({
  lineas,
  validar,
  onCambiarCampo,
  onQuitar,
}: Readonly<{
  lineas: readonly LineaCompra[];
  validar: (linea: LineaCompra) => string | null;
  onCambiarCampo: (idFila: string, campo: 'cantidad' | 'precio', valor: string) => void;
  onQuitar: (idFila: string) => void;
}>): React.JSX.Element {
  return (
    <ContenedorTabla>
      <table className="tabla-hce">
        <caption className="sr-only">Detalle de la compra en curso</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col" className="w-32">
              Cantidad
            </th>
            <th scope="col" className="w-36">
              Costo unitario
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
            const importes = calcularImportes(
              Number(l.cantidad) || 0,
              Number(l.precio) || 0,
            );
            const mensajeError = validar(l);
            const idError = `error-${l.idFila}`;

            return (
              <tr key={l.idFila} className={mensajeError ? 'bg-rose-50/60' : undefined}>
                <td>
                  <p className="font-medium text-slate-900">{l.nombreProducto}</p>
                  <p className="text-xs text-slate-500">Lote {l.nroLote}</p>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.0001"
                    step="1"
                    inputMode="decimal"
                    aria-label={`Cantidad de ${l.nombreProducto}`}
                    aria-invalid={mensajeError ? true : undefined}
                    aria-describedby={mensajeError ? idError : undefined}
                    value={l.cantidad}
                    onChange={(e) => onCambiarCampo(l.idFila, 'cantidad', e.target.value)}
                    className={[
                      'w-full min-h-[40px] rounded-lg border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset focus:ring-2',
                      mensajeError
                        ? 'ring-rose-400 focus:ring-rose-500'
                        : 'ring-slate-300 focus:ring-clinica-600',
                    ].join(' ')}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    aria-label={`Costo unitario de ${l.nombreProducto}`}
                    aria-invalid={mensajeError ? true : undefined}
                    aria-describedby={mensajeError ? idError : undefined}
                    value={l.precio}
                    onChange={(e) => onCambiarCampo(l.idFila, 'precio', e.target.value)}
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
                    aria-label={`Quitar ${l.nombreProducto} de la compra`}
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
