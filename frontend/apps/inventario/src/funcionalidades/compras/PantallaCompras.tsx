'use client';

import type React from 'react';
import { useState } from 'react';

import {
  ErrorApi,
  type Importes,
  type Producto,
  calcularImportes,
  formatearMoneda,
} from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  ContenedorTabla,
  EstadoVacio,
  MarcoAplicacion,
  useSesion,
  ResumenTotales,
  SelectorBuscable,
} from '@hce/ui';

import { apiHce } from '@/compartido/api';
import { useCatalogo } from '@/compartido/use-catalogo';
import { type LineaBase, useLineasDocumento } from '@/compartido/use-lineas-documento';

import { ModalNuevoProducto } from './ModalNuevoProducto';

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

/** Fila del detalle mientras se edita. El costo lo teclea quien compra. */
interface LineaCompra extends LineaBase {
  nroLote: string;
  cantidad: string;
  precio: string;
}

/**
 * Regla de validacion de una linea de compra.
 *
 * Vive fuera del componente porque es una regla de negocio, no presentacion:
 * asi se lee sin rodearla de JSX y no se recrea en cada render.
 *
 * Se comprueba con Number.isFinite y no con `!(x > 0)`: un campo vacio o con
 * texto produce NaN, y `NaN <= 0` es false, de modo que la forma invertida
 * dejaria pasar una linea invalida.
 */
function validarLineaCompra(linea: LineaCompra): string | null {
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
}

/** Importes de una linea, para la previsualizacion del documento. */
function importesDeCompra(linea: LineaCompra): Importes {
  return calcularImportes(Number(linea.cantidad) || 0, Number(linea.precio) || 0);
}

/**
 * Se declara fuera del componente para que su identidad sea estable: el hook la
 * lleva en las dependencias de su efecto, y una funcion recreada en cada render
 * dispararia la carga en bucle.
 */
async function consultarCatalogo(): Promise<readonly Producto[]> {
  const resultado = await apiHce.productos.listar({ tamanoPagina: 200 });
  return resultado.datos;
}

export function PantallaCompras(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const catalogo = useCatalogo(consultarCatalogo, 'No se pudo cargar el catalogo.');
  const detalle = useLineasDocumento<LineaCompra>({
    importesDe: importesDeCompra,
    validar: validarLineaCompra,
  });

  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);
  const [modalProducto, setModalProducto] = useState(false);

  const { datos: productos, cargando: cargandoCatalogo, error } = catalogo;
  const { lineas, totales, lineasConError, validar: validarLinea } = detalle;

  const agregarLinea = (producto: Producto): void => {
    const admitida = detalle.agregar({
      idProducto: producto.idProducto,
      nombreProducto: producto.nombreProducto,
      nroLote: producto.nroLote,
      cantidad: '1',
      precio: producto.costo > 0 ? String(producto.costo) : '',
    });

    if (admitida) {
      catalogo.limpiarError();
      return;
    }
    // Repetir el producto partiria la cantidad en dos filas sin motivo.
    catalogo.reportarError(
      `"${producto.nombreProducto}" ya esta en el detalle. Ajuste su cantidad.`,
    );
  };

  const puedeGuardar = detalle.hayLineas && lineasConError.length === 0 && !guardando;

  const registrar = async (): Promise<void> => {
    catalogo.limpiarError();
    setExito(null);

    if (!detalle.hayLineas) {
      catalogo.reportarError('Agregue al menos un producto a la compra.');
      return;
    }
    if (lineasConError.length > 0) {
      catalogo.reportarError(
        'Revise las lineas senaladas: hay cantidades o costos no validos.',
      );
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
      detalle.vaciar();
      // El catalogo cambio (costo y precio): se recarga para reflejarlo.
      await catalogo.recargar();
    } catch (fallo) {
      catalogo.reportarError(
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
          <Alerta tipo="error" onCerrar={catalogo.limpiarError}>
            {error}
          </Alerta>
        </div>
      )}

      {/* Selector de producto */}
      <div className="tarjeta mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SelectorBuscable
              etiqueta="Agregar producto"
              cargando={cargandoCatalogo}
              marcador="Escriba nombre o numero de lote..."
              ayuda="Busca por nombre o por lote; puede escribir varias palabras sueltas."
              opciones={productos.map((p) => ({
                id: p.idProducto,
                etiqueta: p.nombreProducto,
                // El lote entra en la busqueda: farmacia suele tener la caja
                // delante y es mas rapido teclear el numero que el nombre.
                terminosExtra: p.nroLote,
                nota: `Lote ${p.nroLote}`,
              }))}
              onSeleccionar={(id) => {
                const producto = productos.find((p) => p.idProducto === id);
                if (producto) agregarLinea(producto);
              }}
            />
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
                            detalle.actualizarCampo(l.idFila, 'cantidad', e.target.value)
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
                            detalle.actualizarCampo(l.idFila, 'precio', e.target.value)
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
                          onClick={() => detalle.quitar(l.idFila)}
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
              <Boton variante="secundario" onClick={detalle.vaciar} disabled={guardando}>
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
          // Se agrega ya, con lo que devolvio el servidor al crearlo: quien
          // acaba de darlo de alta espera verlo en el detalle sin esperar nada.
          agregarLinea(producto);
          // Y se relee el catalogo en lugar de parchear el estado local. Ese
          // parcheo es como se acumulan divergencias entre lo que la pantalla
          // cree y lo que la base tiene.
          void catalogo.recargar();
        }}
      />
    </MarcoAplicacion>
  );
}
