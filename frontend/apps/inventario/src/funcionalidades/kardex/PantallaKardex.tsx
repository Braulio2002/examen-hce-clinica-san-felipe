'use client';

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import {
  ErrorApi,
  type FilaKardex,
  type MovimientoProducto,
  formatearCantidad,
  formatearFecha,
  formatearMoneda,
  type MetaPaginacion,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  Campo,
  ContenedorTabla,
  ContenidoAsincrono,
  EstadoVacio,
  EtiquetaStock,
  MarcoAplicacion,
  Modal,
  Paginacion,
} from '@hce/ui';

import { apiHce } from '@/compartido/api';

/**
 * PANTALLA: KARDEX (seccion 1.2.3 del enunciado)
 *
 * Grilla con Id_producto, nombre, stock actual, costo y precio de venta. Cada
 * fila tiene un boton que abre un modal con los movimientos del producto:
 * fecha de registro, tipo de movimiento y cantidad.
 *
 * Se agrega el saldo acumulado por movimiento, que es lo que convierte el
 * listado en un Kardex utilizable para conciliar el inventario fisico.
 */

/*
 * Diez por pagina. Con el catalogo de demostracion -trece productos- eso
 * deja dos paginas, de modo que los controles se ven y se pueden probar.
 * Con un tamano mayor la paginacion existia pero no llegaba a mostrarse
 * nunca, y parecia no estar implementada.
 */
const TAMANO_PAGINA = 10;

export function PantallaKardex(): React.JSX.Element {
  const [filas, setFilas] = useState<FilaKardex[]>([]);
  const [pagina, setPagina] = useState(1);
  const [meta, setMeta] = useState<MetaPaginacion | null>(null);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productoSeleccionado, setProductoSeleccionado] = useState<FilaKardex | null>(
    null,
  );

  const cargar = useCallback(async (paginaActual: number, texto: string) => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await apiHce.kardex.listar({
        pagina: paginaActual,
        tamanoPagina: TAMANO_PAGINA,
        buscar: texto.trim() || undefined,
      });
      setFilas(resultado.datos);
      setMeta(resultado.meta);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo cargar el Kardex.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => void cargar(pagina, buscar), 350);
    return () => window.clearTimeout(temporizador);
  }, [cargar, pagina, buscar]);

  const totalValorizado = filas.reduce((acc, f) => acc + f.valorizado, 0);

  return (
    <MarcoAplicacion
      titulo="Kardex de inventario"
      descripcion="Existencias por producto y trazabilidad de sus movimientos."
    >
      {error && (
        <div className="mb-4">
          <Alerta tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Alerta>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-sm flex-1">
          <Campo
            etiqueta="Buscar"
            type="search"
            placeholder="Nombre o numero de lote"
            value={buscar}
            onChange={(e) => {
              setPagina(1);
              setBuscar(e.target.value);
            }}
          />
        </div>
        <div className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm">
          <span className="text-slate-500">Valorizado en pantalla: </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatearMoneda(totalValorizado)}
          </span>
        </div>
      </div>

      <ContenidoAsincrono
        cargando={cargando}
        hayDatos={filas.length > 0}
        vacio={
          <div className="tarjeta">
            <EstadoVacio
              titulo="Sin productos"
              descripcion={
                buscar
                  ? 'Ningun producto coincide con la busqueda.'
                  : 'Todavia no hay productos en el inventario.'
              }
            />
          </div>
        }
      >
        <>
          <ContenedorTabla>
            <table className="tabla-hce">
              <caption className="sr-only">
                Existencias actuales por producto, con acceso al detalle de movimientos
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="text-right">
                    Id
                  </th>
                  <th scope="col">Producto</th>
                  <th scope="col">Lote</th>
                  <th scope="col" className="text-right">
                    Stock actual
                  </th>
                  <th scope="col" className="text-right">
                    Costo
                  </th>
                  <th scope="col" className="text-right">
                    Precio venta
                  </th>
                  <th scope="col" className="text-right">
                    Valorizado
                  </th>
                  <th scope="col" className="text-right">
                    Movimientos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => (
                  <tr key={f.idProducto}>
                    <td className="text-right tabular-nums text-slate-400">
                      {f.idProducto}
                    </td>
                    <td className="font-medium text-slate-900">{f.nombreProducto}</td>
                    <td className="text-slate-500">{f.nroLote}</td>
                    <td className="text-right">
                      <EtiquetaStock stock={f.stockActual} />
                    </td>
                    <td className="text-right tabular-nums">
                      {formatearMoneda(f.costo)}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatearMoneda(f.precioVenta)}
                    </td>
                    <td className="text-right tabular-nums text-slate-600">
                      {formatearMoneda(f.valorizado)}
                    </td>
                    <td className="text-right">
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        onClick={() => setProductoSeleccionado(f)}
                        aria-label={`Ver movimientos de ${f.nombreProducto}`}
                      >
                        Ver
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>

          {meta && (
            <Paginacion meta={meta} elementos="productos" onCambiarPagina={setPagina} />
          )}
        </>
      </ContenidoAsincrono>

      <ModalMovimientos
        producto={productoSeleccionado}
        onCerrar={() => setProductoSeleccionado(null)}
      />
    </MarcoAplicacion>
  );
}

/* -----------------------------------------------------------------------------
   Modal con los movimientos de un producto
   -------------------------------------------------------------------------- */
function ModalMovimientos({
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
