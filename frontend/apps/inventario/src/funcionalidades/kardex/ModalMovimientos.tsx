'use client';

import type React from 'react';
import { useEffect, useState } from 'react';

import {
  ErrorApi,
  type FilaKardex,
  type MovimientoProducto,
  formatearCantidad,
  formatearFecha,
} from '@hce/api-cliente';
import { Boton, ContenidoAsincrono, EstadoVacio, Modal } from '@hce/ui';

import { apiHce } from '@/compartido/api';

/**
 * Modal de movimientos de un producto (seccion 1.2.3 del enunciado).
 *
 * Vive en su propio archivo, junto a la pantalla que lo abre. Es una unidad
 * con estado y carga propios: mezclarlo con el listado obligaba a leer dos
 * responsabilidades a la vez, y hacia crecer la pantalla sin necesidad.
 *
 * Carga sus datos al abrirse y no antes: son trece filas por producto, pero en
 * un almacen real es un historico que no tiene sentido traer por adelantado
 * para cada fila de la tabla.
 */
/* -----------------------------------------------------------------------------
   Modal con los movimientos de un producto
   -------------------------------------------------------------------------- */
export function ModalMovimientos({
  producto,
  onCerrar,
}: Readonly<{
  producto: FilaKardex | null;
  onCerrar: () => void;
}>): React.JSX.Element {
  const [movimientos, setMovimientos] = useState<MovimientoProducto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!producto) return;

    let cancelado = false;
    setCargando(true);
    setError(null);
    setMovimientos([]);

    apiHce.kardex
      .movimientos(producto.idProducto)
      .then((datos) => {
        if (!cancelado) setMovimientos(datos);
      })
      .catch((fallo: unknown) => {
        if (!cancelado) {
          setError(
            fallo instanceof ErrorApi
              ? fallo.mensaje
              : 'No se pudieron cargar los movimientos.',
          );
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [producto]);

  return (
    <Modal
      abierto={producto !== null}
      titulo={producto ? `Movimientos de ${producto.nombreProducto}` : 'Movimientos'}
      descripcion={
        producto
          ? `Lote ${producto.nroLote} — stock actual ${formatearCantidad(producto.stockActual)}`
          : undefined
      }
      onCerrar={onCerrar}
      ancho="xl"
      pie={
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      <ContenidoAsincrono
        cargando={cargando}
        error={error}
        hayDatos={movimientos.length > 0}
        alturaCargador="h-6 w-6"
        vacio={
          <EstadoVacio
            titulo="Sin movimientos"
            descripcion="Este producto todavia no registra entradas ni salidas."
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="tabla-hce">
            <caption className="sr-only">
              Entradas y salidas registradas para el producto
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha registro</th>
                <th scope="col">Tipo movimiento</th>
                <th scope="col" className="text-right">
                  Cantidad
                </th>
                <th scope="col" className="text-right">
                  Saldo
                </th>
                <th scope="col" className="text-right">
                  Documento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.map((m) => {
                const esEntrada = m.idTipoMovimiento === 1;
                return (
                  <tr key={m.idMovimientoDet}>
                    <td className="text-slate-600">{formatearFecha(m.fechaRegistro)}</td>
                    <td>
                      <span
                        className={[
                          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                          esEntrada
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            : 'bg-amber-50 text-amber-800 ring-amber-600/20',
                        ].join(' ')}
                      >
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          {esEntrada ? (
                            <path d="M10 3a1 1 0 0 1 1 1v9.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L9 13.586V4a1 1 0 0 1 1-1Z" />
                          ) : (
                            <path d="M10 17a1 1 0 0 1-1-1V6.414L5.707 9.707a1 1 0 0 1-1.414-1.414l5-5a1 1 0 0 1 1.414 0l5 5a1 1 0 1 1-1.414 1.414L11 6.414V16a1 1 0 0 1-1 1Z" />
                          )}
                        </svg>
                        {m.tipoMovimiento}
                      </span>
                    </td>
                    <td
                      className={[
                        'text-right font-medium tabular-nums',
                        esEntrada ? 'text-emerald-700' : 'text-amber-700',
                      ].join(' ')}
                    >
                      {esEntrada ? '+' : '-'}
                      {formatearCantidad(m.cantidad)}
                    </td>
                    <td className="text-right tabular-nums text-slate-900">
                      {formatearCantidad(m.saldo)}
                    </td>
                    <td className="text-right text-slate-500">
                      {esEntrada ? 'Compra' : 'Venta'} N.° {m.documentoOrigen}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ContenidoAsincrono>
    </Modal>
  );
}
