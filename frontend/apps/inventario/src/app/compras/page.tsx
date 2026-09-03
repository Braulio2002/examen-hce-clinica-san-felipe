'use client';

import {
  ErrorApi,
  Producto,
  calcularImportes,
  formatearMoneda,
  precioVentaDesdeCosto,
  sumarImportes,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  Campo,
  Cargador,
  ContenedorTabla,
  EstadoVacio,
  MarcoAplicacion,
  Modal,
  useSesion,
} from '@hce/ui';
import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

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
      setError(fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo cargar el catalogo.');
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

  const actualizarLinea = (idFila: string, campo: 'cantidad' | 'precio', valor: string): void => {
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
        lineas.map((l) => calcularImportes(Number(l.cantidad) || 0, Number(l.precio) || 0)),
      ),
    [lineas],
  );

  const hayLineasInvalidas = lineas.some(
    (l) => !(Number(l.cantidad) > 0) || !(Number(l.precio) >= 0) || l.precio === '',
  );

  const registrar = async (): Promise<void> => {
    setError(null);
    setExito(null);

    if (lineas.length === 0) {
      setError('Agregue al menos un producto a la compra.');
      return;
    }
    if (hayLineasInvalidas) {
      setError('Revise las cantidades y los costos: deben ser numeros validos y mayores a cero.');
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
      setError(fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar la compra.');
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeOperar) {
    return (
      <MarcoAplicacion titulo="Registrar compra">
        <Alerta tipo="aviso" titulo="Acceso restringido">
          Su rol permite consultar informacion, pero no registrar compras. Solicite acceso al
          administrador del sistema.
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
                  <th scope="col" className="w-32">Cantidad</th>
                  <th scope="col" className="w-36">Costo unitario</th>
                  <th scope="col" className="text-right">Subtotal</th>
                  <th scope="col" className="text-right">IGV</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineas.map((l) => {
                  const importes = calcularImportes(Number(l.cantidad) || 0, Number(l.precio) || 0);
                  return (
                    <tr key={l.idFila}>
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
                          value={l.cantidad}
                          onChange={(e) => actualizarLinea(l.idFila, 'cantidad', e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-clinica-600"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          aria-label={`Costo unitario de ${l.nombreProducto}`}
                          value={l.precio}
                          onChange={(e) => actualizarLinea(l.idFila, 'precio', e.target.value)}
                          className="w-full min-h-[40px] rounded-lg border-0 px-2 py-1.5 text-right tabular-nums ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-clinica-600"
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        {formatearMoneda(importes.subTotal)}
                      </td>
                      <td className="text-right tabular-nums">{formatearMoneda(importes.igv)}</td>
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
            <div className="tarjeta w-full sm:max-w-xs">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tabular-nums text-slate-900">
                    {formatearMoneda(totales.subTotal)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">IGV</dt>
                  <dd className="tabular-nums text-slate-900">{formatearMoneda(totales.igv)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <dt className="font-semibold text-slate-900">Total</dt>
                  <dd className="font-semibold tabular-nums text-clinica-700">
                    {formatearMoneda(totales.total)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => setLineas([])} disabled={guardando}>
                Vaciar
              </Boton>
              <Boton tamano="lg" onClick={() => void registrar()} cargando={guardando}>
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

/* -----------------------------------------------------------------------------
   Modal de alta rapida de producto, invocado desde la compra
   -------------------------------------------------------------------------- */
function ModalNuevoProducto({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (producto: Producto) => void;
}): React.JSX.Element {
  const [nombre, setNombre] = useState('');
  const [lote, setLote] = useState('');
  const [costo, setCosto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setNombre('');
      setLote('');
      setCosto('');
      setError(null);
    }
  }, [abierto]);

  const costoNumero = Number(costo);

  const enviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setError(null);

    if (!nombre.trim()) return setError('El nombre del producto es obligatorio.');
    if (!lote.trim()) return setError('El numero de lote es obligatorio.');
    if (!Number.isFinite(costoNumero) || costoNumero < 0) {
      return setError('El costo debe ser un numero mayor o igual a cero.');
    }

    setGuardando(true);
    try {
      const producto = await apiHce.productos.registrar({
        nombreProducto: nombre.trim(),
        nroLote: lote.trim(),
        costo: costoNumero,
      });
      onCreado(producto);
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar producto"
      descripcion="El producto se agrega al catalogo y se anade a la compra en curso."
      onCerrar={onCerrar}
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-nuevo-producto" cargando={guardando}>
            Registrar y agregar
          </Boton>
        </>
      }
    >
      <form id="formulario-nuevo-producto" onSubmit={enviar} noValidate className="space-y-4">
        {error && <Alerta tipo="error">{error}</Alerta>}

        <Campo
          etiqueta="Nombre del producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ketorolaco 30 mg Ampolla"
          maxLength={150}
          disabled={guardando}
        />
        <Campo
          etiqueta="Numero de lote"
          value={lote}
          onChange={(e) => setLote(e.target.value)}
          placeholder="LT-2026-0013"
          maxLength={50}
          disabled={guardando}
        />
        <Campo
          etiqueta="Costo unitario"
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          placeholder="0.45"
          disabled={guardando}
          ayuda={
            costo && Number.isFinite(costoNumero) && costoNumero >= 0
              ? `Precio de venta inicial: ${formatearMoneda(precioVentaDesdeCosto(costoNumero))} (costo x 1.35)`
              : 'El precio de venta se calcula como costo x 1.35'
          }
        />
      </form>
    </Modal>
  );
}
