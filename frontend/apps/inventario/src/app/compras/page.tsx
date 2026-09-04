'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ErrorApi,
  type Producto,
  calcularImportes,
  formatearMoneda,
  sumarImportes,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  ContenedorTabla,
  EstadoVacio,
  MarcoAplicacion,
  useSesion,
  ResumenTotales,
} from '@hce/ui';

import { ModalNuevoProducto } from '@/componentes/ModalNuevoProducto';
import { apiHce } from '@/lib/api';

/**
 * PANTALLA: REGISTRO DE COMPRA (seccion 1.2.1 del enunciado)
 *
 * Permite cargar varias lineas y, si el producto no existe, crearlo desde un
 * modal sin abandonar la compra en curso.
 *
 * Al confirmar, el BackEnd ejecuta todo en una unica transaccion:
 *   1. Graba CompraCab y CompraDet.
 *   2. Actualiza el costo del producto y recalcula su precio de venta (x 1.35).
 *   3. Genera el movimiento de tipo Entrada en el Kardex.
 *
 * Los importes que se muestran mientras se digita son una previsualizacion. Lo
 * que se persiste son los que devuelve el servidor: el cliente solo envia
 * producto, cantidad y costo.
 */

interface LineaEditable {
  idFila: string;
  idProducto: number;
  nombreProducto: string;
  nroLote: string;
  cantidad: string;
  precio: string;
}

export default function PaginaCompras(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [modalProducto, setModalProducto] = useState(false);

  const [seleccion, setSeleccion] = useState('');

  const cargarCatalogo = useCallback(async () => {
    setCargandoCatalogo(true);
    try {
      const resultado = await apiHce.productos.listar({ tamanoPagina: 200 });
      setProductos(resultado.datos);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo cargar el catalogo.',
      );
    } finally {
      setCargandoCatalogo(false);
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  const agregarLinea = (producto: Producto): void => {
    // Si el producto ya esta en la compra se enfoca esa fila en lugar de duplicarla.
    if (lineas.some((l) => l.idProducto === producto.idProducto)) {
      setError(`"${producto.nombreProducto}" ya esta en el detalle. Ajuste su cantidad.`);
      return;
    }
    setError(null);
    setLineas((actuales) => [
      ...actuales,
      {
        idFila: `${producto.idProducto}-${Date.now()}`,
        idProducto: producto.idProducto,
        nombreProducto: producto.nombreProducto,
        nroLote: producto.nroLote,
        cantidad: '1',
        precio: producto.costo > 0 ? String(producto.costo) : '',
      },
    ]);
    setSeleccion('');
  };

  const actualizarLinea = (
    idFila: string,
    campo: 'cantidad' | 'precio',
    valor: string,
  ): void => {
    setLineas((actuales) =>
      actuales.map((l) => (l.idFila === idFila ? { ...l, [campo]: valor } : l)),
    );
  };

  const quitarLinea = (idFila: string): void => {
    setLineas((actuales) => actuales.filter((l) => l.idFila !== idFila));
  };

  const totales = useMemo(
    () =>
      sumarImportes(
        lineas.map((l) =>
          calcularImportes(Number(l.cantidad) || 0, Number(l.precio) || 0),
        ),
      ),
    [lineas],
  );

  /*
   * Devuelve el motivo por el que la linea no es valida, o null si lo es.
   *
   * Antes esto era un booleano suelto que solo se consultaba dentro de
   * `registrar()`: el usuario podia pulsar "Registrar compra" con datos
   * invalidos y solo se enteraba despues, por un aviso generico arriba de la
   * pantalla. Ventas, que es la pantalla gemela, si senalaba el campo concreto.
   * Las dos implementaciones del mismo flujo divergieron por duplicacion, y
   * quien perdia era el usuario de lector de pantalla: no habia forma de saber
   * que campo fallaba.
   *
   * Se comprueba con Number.isFinite y no con `!(x > 0)`: un campo vacio o con
   * texto produce NaN, y `NaN <= 0` es false, de modo que la forma invertida
   * dejaria pasar una linea invalida.
   */
  const validarLinea = (linea: LineaEditable): string | null => {
    const cantidad = Number(linea.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return 'La cantidad debe ser un numero mayor a cero.';
    }
    if (linea.precio === '') {
      return 'Indique el costo unitario.';
    }
    const precio = Number(linea.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      return 'El costo debe ser un numero mayor o igual a cero.';
    }
    return null;
  };

  const lineasConError = lineas.filter((l) => validarLinea(l) !== null);
  const puedeGuardar = lineas.length > 0 && lineasConError.length === 0 && !guardando;

  const registrar = async (): Promise<void> => {
    setError(null);
    setExito(null);

    if (lineas.length === 0) {
      setError('Agregue al menos un producto a la compra.');
      return;
    }
    if (lineasConError.length > 0) {
      setError('Revise las lineas senaladas: hay cantidades o costos no validos.');
      return;
    }

    setGuardando(true);
    try {
      const compra = await apiHce.compras.registrar(
        lineas.map((l) => ({
          idProducto: l.idProducto,
          cantidad: Number(l.cantidad),
          precio: Number(l.precio),
        })),
      );
      setExito(
        `Compra N.° ${compra.idCompraCab} registrada por ${formatearMoneda(compra.total)}. ` +
          'Se actualizo el costo y el precio de venta, y se genero el movimiento de Entrada.',
      );
      setLineas([]);
      // El catalogo cambio (costo y precio): se recarga para reflejarlo.
      await cargarCatalogo();
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar la compra.',
      );
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeOperar) {
    return (
      <MarcoAplicacion titulo="Registrar compra">
        <Alerta tipo="aviso" titulo="Acceso restringido">
          Su rol permite consultar informacion, pero no registrar compras. Solicite acceso
          al administrador del sistema.
        </Alerta>
      </MarcoAplicacion>
    );
  }

  return (
    <MarcoAplicacion
      titulo="Registrar compra"
      descripcion="Ingreso de medicamentos e insumos al almacen clinico."
    >
      {exito && (
        <div className="mb-4">
          <Alerta tipo="exito" titulo="Compra registrada" onCerrar={() => setExito(null)}>
            {exito}
          </Alerta>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alerta tipo="error" onCerrar={() => setError(null)}>
            {error}
          </Alerta>
        </div>
      )}

      {/* Selector de producto */}
      <div className="tarjeta mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="selector-producto"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Agregar producto
            </label>
            <select
              id="selector-producto"
              value={seleccion}
              disabled={cargandoCatalogo}
              onChange={(e) => {
                const id = Number(e.target.value);
                const producto = productos.find((p) => p.idProducto === id);
                if (producto) agregarLinea(producto);
              }}
              className="block min-h-[44px] w-full rounded-lg border-0 px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-clinica-600"
            >
              <option value="">
                {cargandoCatalogo ? 'Cargando catalogo...' : 'Seleccione un producto'}
              </option>
              {productos.map((p) => (
                <option key={p.idProducto} value={p.idProducto}>
                  {p.nombreProducto} — Lote {p.nroLote}
                </option>
              ))}
            </select>
          </div>

          {/* Requisito del enunciado: si el producto no existe, crearlo desde un modal. */}
          <Boton variante="secundario" onClick={() => setModalProducto(true)}>
            El producto no existe
          </Boton>
        </div>
      </div>

      {/* Detalle */}
      {lineas.length === 0 ? (
        <div className="tarjeta">
          <EstadoVacio
            titulo="Compra sin productos"
            descripcion="Seleccione un producto del catalogo o registre uno nuevo para comenzar."
          />
        </div>
      ) : (
        <>
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
                  const mensajeError = validarLinea(l);
                  const idError = `error-${l.idFila}`;

                  return (
                    <tr
                      key={l.idFila}
                      className={mensajeError ? 'bg-rose-50/60' : undefined}
                    >
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
                          onChange={(e) =>
                            actualizarLinea(l.idFila, 'cantidad', e.target.value)
                          }
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
                          onChange={(e) =>
                            actualizarLinea(l.idFila, 'precio', e.target.value)
                          }
                          className={[
                            'w-full min-h-[40px] rounded-lg border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset focus:ring-2',
                            mensajeError
                              ? 'ring-rose-400 focus:ring-rose-500'
                              : 'ring-slate-300 focus:ring-clinica-600',
                          ].join(' ')}
                        />
                        {mensajeError && (
                          <p
                            id={idError}
                            role="alert"
                            className="mt-1 text-xs text-rose-600"
                          >
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
                          onClick={() => quitarLinea(l.idFila)}
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

          {/* Totales y confirmacion */}
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <ResumenTotales totales={totales} />

            <div className="flex gap-2">
              <Boton
                variante="secundario"
                onClick={() => setLineas([])}
                disabled={guardando}
              >
                Vaciar
              </Boton>
              <Boton
                tamano="lg"
                onClick={() => void registrar()}
                cargando={guardando}
                disabled={!puedeGuardar}
                title={
                  lineasConError.length > 0
                    ? 'Hay lineas con cantidades o costos no validos'
                    : undefined
                }
              >
                Registrar compra
              </Boton>
            </div>
          </div>
        </>
      )}

      <ModalNuevoProducto
        abierto={modalProducto}
        onCerrar={() => setModalProducto(false)}
        onCreado={(producto) => {
          setModalProducto(false);
          setProductos((actuales) => [...actuales, producto]);
          agregarLinea(producto);
        }}
      />
    </MarcoAplicacion>
  );
}
