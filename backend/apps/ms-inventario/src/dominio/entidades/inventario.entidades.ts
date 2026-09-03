import { Importe } from '@hce/compartido';

/**
 * Entidades y objetos de valor del agregado Inventario.
 *
 * Este microservicio agrupa Compras, Ventas y Kardex en un solo bounded context
 * por una razon deliberada: las tres operan sobre el MISMO invariante, el stock
 * derivado de la tabla de movimientos. Separarlas en servicios distintos
 * obligaria a coordinar una transaccion distribuida (saga o 2PC) para algo que
 * la base resuelve de forma atomica, y abriria la puerta a sobreventa de
 * medicamentos durante la ventana de inconsistencia eventual. En un sistema de
 * salud ese riesgo no es aceptable.
 */

export type TipoMovimiento = 1 | 2; // (1) Entrada, (2) Salida

export const TIPO_MOVIMIENTO = {
  ENTRADA: 1 as TipoMovimiento,
  SALIDA: 2 as TipoMovimiento,
} as const;

/** Linea solicitada por el cliente al registrar una compra. */
export interface LineaCompra {
  readonly idProducto: number;
  readonly cantidad: number;
  /** Costo unitario de adquisicion. */
  readonly precio: number;
}

/** Linea solicitada por el cliente al registrar una venta. */
export interface LineaVenta {
  readonly idProducto: number;
  readonly cantidad: number;
  /*
   * El precio NO se acepta del cliente. Se toma del catalogo en el servidor.
   * Aceptarlo permitiria a un cliente manipulado despachar medicamentos a
   * precio cero.
   */
}

/** Linea persistida, con los importes ya calculados. */
export interface LineaDocumento {
  readonly idDetalle: number;
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly cantidad: number;
  readonly precio: number;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
}

export interface DocumentoCompra {
  readonly idCompraCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly detalle: readonly LineaDocumento[];
}

export interface DocumentoVenta {
  readonly idVentaCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly detalle: readonly LineaDocumento[];
}

export interface ResumenCompra {
  readonly idCompraCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly items: number;
}

export interface ResumenVenta {
  readonly idVentaCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly items: number;
}

/** Fila de la grilla principal del Kardex (seccion 1.2.3 del enunciado). */
export interface FilaKardex {
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly stockActual: number;
  readonly costo: number;
  readonly precioVenta: number;
  readonly valorizado: number;
}

/** Fila del modal de movimientos de un producto. */
export interface MovimientoProducto {
  readonly idMovimientoDet: number;
  readonly fechaRegistro: Date;
  readonly tipoMovimiento: string;
  readonly idTipoMovimiento: TipoMovimiento;
  readonly documentoOrigen: number;
  readonly cantidad: number;
  /** Saldo acumulado tras el movimiento: convierte la lista en un Kardex real. */
  readonly saldo: number;
}

/**
 * Reglas de negocio del documento, verificables sin base de datos.
 *
 * Existen aqui, y no solo en el procedimiento almacenado, porque el dominio
 * debe poder rechazar una operacion invalida antes de consumir una conexion.
 * La validacion en SQL sigue siendo la autoridad final: esta es la primera
 * barrera, no la unica.
 */
export class ReglasDocumento {
  static readonly MAX_LINEAS = 200;

  static validarLineasCompra(lineas: readonly LineaCompra[]): void {
    ReglasDocumento.validarCardinalidad(lineas.length, 'compra');

    for (const linea of lineas) {
      if (!Number.isInteger(linea.idProducto) || linea.idProducto <= 0) {
        throw new RangeError('Cada linea debe referenciar un producto valido.');
      }
      if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
        throw new RangeError('Las cantidades de la compra deben ser mayores a cero.');
      }
      if (!Number.isFinite(linea.precio) || linea.precio < 0) {
        throw new RangeError('El costo unitario no puede ser negativo.');
      }
    }
  }

  static validarLineasVenta(lineas: readonly LineaVenta[]): void {
    ReglasDocumento.validarCardinalidad(lineas.length, 'venta');

    for (const linea of lineas) {
      if (!Number.isInteger(linea.idProducto) || linea.idProducto <= 0) {
        throw new RangeError('Cada linea debe referenciar un producto valido.');
      }
      if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
        throw new RangeError('Las cantidades de la venta deben ser mayores a cero.');
      }
    }
  }

  /** Totales previstos por el dominio, usados para verificar lo devuelto por la base. */
  static totalesPrevistos(
    lineas: readonly { cantidad: number; precio: number }[],
  ): { subTotal: number; igv: number; total: number } {
    return Importe.sumar(lineas.map((l) => Importe.calcular(l.cantidad, l.precio))).toJSON();
  }

  private static validarCardinalidad(cantidadLineas: number, documento: string): void {
    if (cantidadLineas === 0) {
      throw new RangeError(`La ${documento} debe contener al menos un producto.`);
    }
    if (cantidadLineas > ReglasDocumento.MAX_LINEAS) {
      throw new RangeError(
        `Una ${documento} no puede superar ${ReglasDocumento.MAX_LINEAS} lineas de detalle.`,
      );
    }
  }
}
