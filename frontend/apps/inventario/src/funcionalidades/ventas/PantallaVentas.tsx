'use client';

import type React from 'react';
import { useState } from 'react';

import {
  ErrorApi,
  type FilaKardex,
  type Importes,
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

import { TablaLineasVenta } from './TablaLineasVenta';

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

/**
 * Fila del detalle mientras se edita.
 *
 * Guarda `precioVenta` y `stockDisponible` tal como los devolvio el servidor.
 * El precio es solo para previsualizar: al registrar se envian producto y
 * cantidad, y el importe definitivo lo calcula la base de datos.
 */
export interface LineaVenta extends LineaBase {
  nroLote: string;
  precioVenta: number;
  stockDisponible: number;
  cantidad: string;
}

/**
 * Regla de validacion de una linea de venta.
 *
 * A diferencia de la compra, aqui hay un tope: el stock. Esta comprobacion es
 * de conveniencia -avisa antes de enviar-, no el control real. La autoridad es
 * el procedimiento almacenado, que revalida con UPDLOCK dentro de la misma
 * transaccion que descuenta; sin eso, dos cajas podrian vender a la vez la
 * ultima unidad.
 */
/**
 * Un producto solo se puede vender si queda alguna unidad.
 *
 * Es una regla de negocio, no de presentacion, y por eso tiene nombre propio y
 * un unico lugar. Antes estaba escrita dos veces -una para deshabilitar la
 * opcion del buscador y otra como guarda al agregar la linea-, y la segunda no
 * podia ejecutarse nunca porque la primera ya lo impedia. Dos copias de la
 * misma condicion sobre el mismo dato no son defensa en profundidad: son
 * duplicacion, y una de ellas es codigo que nadie puede verificar.
 *
 * La palabra final sobre el stock la tiene el procedimiento almacenado, que
 * bloquea la fila al vender. Esto solo evita que el usuario llegue hasta ahi
 * para nada.
 */
function hayStock(fila: FilaKardex): boolean {
  return fila.stockActual > 0;
}

function validarLineaVenta(linea: LineaVenta): string | null {
  const cantidad = Number(linea.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return 'Ingrese una cantidad mayor a cero.';
  }
  if (cantidad > linea.stockDisponible) {
    // Mensaje exigido por el enunciado.
    return `La cantidad no debe ser mayor al stock (${linea.stockDisponible} disponibles).`;
  }
  return null;
}

/** Importes de una linea: el precio lo fija el servidor, no el usuario. */
function importesDeVenta(linea: LineaVenta): Importes {
  return calcularImportes(Number(linea.cantidad) || 0, linea.precioVenta);
}

/**
 * Se consulta el Kardex y no el catalogo: es la vista que trae el stock.
 *
 * Va fuera del componente para que su identidad sea estable; el hook la lleva
 * en las dependencias de su efecto.
 */
async function consultarInventario(): Promise<readonly FilaKardex[]> {
  const resultado = await apiHce.kardex.listar({ tamanoPagina: 200 });
  return resultado.datos;
}

export function PantallaVentas(): React.JSX.Element {
  const { puedeOperar } = useSesion();

  const inventario = useCatalogo(consultarInventario, 'No se pudo cargar el inventario.');
  const detalle = useLineasDocumento<LineaVenta>({
    importesDe: importesDeVenta,
    validar: validarLineaVenta,
  });

  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const { datos: catalogo, cargando, error } = inventario;
  const { lineas, totales, lineasConError, validar: validarLinea } = detalle;

  const agregarLinea = (fila: FilaKardex): void => {
    const admitida = detalle.agregar({
      idProducto: fila.idProducto,
      nombreProducto: fila.nombreProducto,
      nroLote: fila.nroLote,
      precioVenta: fila.precioVenta,
      stockDisponible: fila.stockActual,
      cantidad: '1',
    });

    if (admitida) {
      inventario.limpiarError();
      return;
    }
    inventario.reportarError(
      `"${fila.nombreProducto}" ya esta en la venta. Ajuste su cantidad.`,
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
    inventario.limpiarError();
    setExito(null);

    setGuardando(true);
    try {
      const venta = await apiHce.ventas.registrar(
        lineas.map((l) => ({ idProducto: l.idProducto, cantidad: Number(l.cantidad) })),
      );
      setExito(
        `Venta N.° ${venta.idVentaCab} registrada por ${formatearMoneda(venta.total)}. ` +
          'Se genero el movimiento de Salida en el Kardex.',
      );
      detalle.vaciar();
      await inventario.recargar();
    } catch (fallo) {
      inventario.reportarError(
        fallo instanceof ErrorApi ? fallo.mensaje : 'No se pudo registrar la venta.',
      );
      // El stock pudo cambiar por otra operacion concurrente: se refresca.
      await inventario.recargar();
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
          <Alerta tipo="error" onCerrar={inventario.limpiarError}>
            {error}
          </Alerta>
        </div>
      )}

      <div className="tarjeta mb-6">
        {/* El selector aporta su propia etiqueta enlazada por identificador. */}
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
            deshabilitada: !hayStock(c),
            nota: hayStock(c)
              ? `${formatearMoneda(c.precioVenta)} · stock ${String(c.stockActual)}`
              : 'sin stock',
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
          <TablaLineasVenta
            lineas={lineas}
            validar={validarLinea}
            onCambiarCantidad={(idFila, valor) =>
              detalle.actualizarCampo(idFila, 'cantidad', valor)
            }
            onQuitar={detalle.quitar}
          />

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
