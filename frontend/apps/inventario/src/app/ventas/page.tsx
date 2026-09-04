'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ErrorApi,
  type FilaKardex,
  calcularImportes,
  formatearMoneda,
  sumarImportes,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  ContenedorTabla,
  EstadoVacio,
  EtiquetaStock,
  MarcoAplicacion,
  useSesion,
  ResumenTotales,
  SelectorBuscable,
} from '@hce/ui';

import { apiHce } from '@/lib/api';

/**
 * PANTALLA: REGISTRO DE VENTA (seccion 1.2.2 del enunciado)
 *
 * Muestra por cada producto su precio de venta y el stock disponible, calculado
 * desde la tabla de movimientos. No permite guardar cuando alguna cantidad
 * supera el stock: la fila se marca y el boton queda deshabilitado con el
 * mensaje correspondiente.
 *
 * La validacion del cliente es de conveniencia. La autoridad es el BackEnd, que
 * revalida dentro de la transaccion con bloqueo; si otra caja vende las mismas
 * unidades entre que se carga la pantalla y se confirma, el servidor rechaza la
 * operacion con 422 y aqui se muestra su mensaje.
 */

interface LineaVentaEditable {
  idFila: string;
  idProducto: number;
  nombreProducto: string;
  nroLote: string;
  precioVenta: number;
  stockDisponible: number;
  cantidad: string;
}

export default function PaginaVentas(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const [catalogo, setCatalogo] = useState<FilaKardex[]>([]);
  const [lineas, setLineas] = useState<LineaVentaEditable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargarCatalogo = useCallback(async () => {
    setCargando(true);
    try {
      // Se consulta el Kardex y no el catalogo: es la vista que trae el stock.
      const resultado = await apiHce.kardex.listar({ tamanoPagina: 200 });
      setCatalogo(resultado.datos);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo cargar el inventario.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarCatalogo();
  }, [cargarCatalogo]);

  const agregarLinea = (fila: FilaKardex): void => {
    if (lineas.some((l) => l.idProducto === fila.idProducto)) {
      setError(`"${fila.nombreProducto}" ya esta en la venta. Ajuste su cantidad.`);
      return;
    }
    if (fila.stockActual <= 0) {
      setError(`"${fila.nombreProducto}" no tiene stock disponible.`);
      return;
    }
    setError(null);
    setLineas((actuales) => [
      ...actuales,
      {
        idFila: `${fila.idProducto}-${Date.now()}`,
        idProducto: fila.idProducto,
        nombreProducto: fila.nombreProducto,
        nroLote: fila.nroLote,
        precioVenta: fila.precioVenta,
        stockDisponible: fila.stockActual,
        cantidad: '1',
      },
    ]);
  };

  const cambiarCantidad = (idFila: string, valor: string): void => {
    setLineas((actuales) =>
      actuales.map((l) => (l.idFila === idFila ? { ...l, cantidad: valor } : l)),
    );
  };

  const quitarLinea = (idFila: string): void => {
    setLineas((actuales) => actuales.filter((l) => l.idFila !== idFila));
  };

  /** Devuelve el mensaje de error de una linea, o null si es valida. */
  const validarLinea = (linea: LineaVentaEditable): string | null => {
    const cantidad = Number(linea.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return 'Ingrese una cantidad mayor a cero.';
    }
    if (cantidad > linea.stockDisponible) {
      // Mensaje exigido por el enunciado.
      return `La cantidad no debe ser mayor al stock (${linea.stockDisponible} disponibles).`;
    }
    return null;
  };

  const totales = useMemo(
    () =>
      sumarImportes(
        lineas.map((l) => calcularImportes(Number(l.cantidad) || 0, l.precioVenta)),
      ),
    [lineas],
  );

  const lineasConError = lineas.filter((l) => validarLinea(l) !== null);
  const puedeGuardar = lineas.length > 0 && lineasConError.length === 0 && !guardando;

  const registrar = async (): Promise<void> => {
    setError(null);
    setExito(null);

    if (lineas.length === 0) {
      setError('Agregue al menos un producto a la venta.');
      return;
    }
    if (lineasConError.length > 0) {
      setError('Corrija las cantidades marcadas antes de guardar.');
      return;
    }

    setGuardando(true);
    try {
      const venta = await apiHce.ventas.registrar(
        lineas.map((l) => ({ idProducto: l.idProducto, cantidad: Number(l.cantidad) })),
      );
      setExito(
        `Venta N.° ${venta.idVentaCab} registrada por ${formatearMoneda(venta.total)}. ` +
          'Se genero el movimiento de Salida en el Kardex.',
      );
      setLineas([]);
      await cargarCatalogo();
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar la venta.',
      );
      // El stock pudo cambiar por otra operacion concurrente: se refresca.
      await cargarCatalogo();
    } finally {
      setGuardando(false);
    }
  };

  if (!puedeOperar) {
    return (
      <MarcoAplicacion titulo="Registrar venta">
        <Alerta tipo="aviso" titulo="Acceso restringido">
          Su rol permite consultar informacion, pero no registrar ventas.
        </Alerta>
      </MarcoAplicacion>
    );
  }

  return (
    <MarcoAplicacion
      titulo="Registrar venta"
      descripcion="Despacho de medicamentos e insumos en la atencion medica."
    >
      {exito && (
        <div className="mb-4">
          <Alerta tipo="exito" titulo="Venta registrada" onCerrar={() => setExito(null)}>
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

      <div className="tarjeta mb-6">
        <label
          htmlFor="selector-venta"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Agregar producto
        </label>
        <SelectorBuscable
          etiqueta="Agregar producto"
          cargando={cargando}
          marcador="Escriba nombre o numero de lote..."
          ayuda="El precio y el stock provienen del servidor. El stock se calcula desde la tabla de movimientos."
          sinResultados="Ningun producto del inventario coincide con la busqueda."
          opciones={catalogo.map((c) => ({
            id: c.idProducto,
            etiqueta: c.nombreProducto,
            terminosExtra: c.nroLote,
            // Sin existencias se muestra, pero no se puede elegir: ocultarlo
            // haria pensar que el producto no existe.
            deshabilitada: c.stockActual <= 0,
            nota:
              c.stockActual <= 0
                ? 'sin stock'
                : `${formatearMoneda(c.precioVenta)} · stock ${String(c.stockActual)}`,
          }))}
          onSeleccionar={(id) => {
            const fila = catalogo.find((c) => c.idProducto === id);
            if (fila) agregarLinea(fila);
          }}
        />
      </div>

      {lineas.length === 0 ? (
        <div className="tarjeta">
          <EstadoVacio
            titulo="Venta sin productos"
            descripcion="Seleccione los insumos despachados en la atencion."
          />
        </div>
      ) : (
        <>
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
                  const mensajeError = validarLinea(l);
                  const importes = calcularImportes(
                    Number(l.cantidad) || 0,
                    l.precioVenta,
                  );
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
                          onChange={(e) => cambiarCantidad(l.idFila, e.target.value)}
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
                    ? 'Hay cantidades que superan el stock disponible'
                    : undefined
                }
              >
                Registrar venta
              </Boton>
            </div>
          </div>
        </>
      )}
    </MarcoAplicacion>
  );
}
