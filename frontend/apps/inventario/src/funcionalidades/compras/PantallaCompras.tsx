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
import { TablaLineasCompra } from './TablaLineasCompra';

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
export interface LineaCompra extends LineaBase {
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

  /*
   * Sin guardas de validacion al inicio, y es deliberado.
   *
   * Habia dos -"agregue al menos un producto" y "revise las lineas senaladas"-
   * que no podian ejecutarse nunca: cuando no hay lineas el boton ni se
   * renderiza, y cuando alguna es invalida `puedeGuardar` lo deshabilita. Eran
   * la misma condicion, sobre el mismo estado, evaluada dos veces en el mismo
   * instante. Eso no es defensa en profundidad: es duplicacion, y la copia
   * inalcanzable es codigo que nadie puede verificar.
   *
   * La regla vive ahora en un solo sitio, el renderizado, y hay pruebas que la
   * fijan: sin lineas no aparece el boton, y con lineas invalidas aparece
   * deshabilitado.
   */
  const registrar = async (): Promise<void> => {
    catalogo.limpiarError();
    setExito(null);

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
          <TablaLineasCompra
            lineas={lineas}
            validar={validarLinea}
            onCambiarCampo={detalle.actualizarCampo}
            onQuitar={detalle.quitar}
          />

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
