import { Importe } from '@hce/compartido';

/**
 * CAPA 1 · DOMINIO — Reglas de negocio de empresa del agregado Inventario.
 *
 * Este archivo no importa NADA fuera del dominio compartido. Ni NestJS, ni el
 * driver de base de datos, ni un DTO de transporte. Es la capa más interna de
 * Clean Architecture y la que sobrevive a cualquier cambio tecnológico.
 *
 * POR QUE COMPRAS, VENTAS Y KARDEX VIVEN EN UN SOLO AGREGADO
 * ----------------------------------------------------------
 * Las tres operan sobre el MISMO invariante: el stock derivado de la tabla de
 * movimientos. Separarlas en microservicios distintos obligaría a coordinar una
 * transacción distribuida (saga con compensación o 2PC) para algo que la base
 * resuelve de forma atómica, y abriría una ventana de inconsistencia eventual
 * durante la cual dos cajas podrían despachar el mismo medicamento.
 *
 * En un sistema de salud ese riesgo no es aceptable. Regla aplicada: un
 * agregado de dominio no se parte entre servicios.
 */

export type TipoMovimiento = 1 | 2; // (1) Entrada, (2) Salida

export const TIPO_MOVIMIENTO = {
  ENTRADA: 1 as TipoMovimiento,
  SALIDA: 2 as TipoMovimiento,
} as const;

/** Línea solicitada al registrar una compra. */
export interface LineaCompra {
  readonly idProducto: number;
  readonly cantidad: number;
  /** Costo unitario de adquisición. */
  readonly precio: number;
}

/**
 * Línea solicitada al registrar una venta.
 *
 * No lleva precio a propósito: lo determina el servidor a partir del catálogo.
 * Aceptarlo del cliente permitiría despachar medicamentos a importe manipulado.
 */
export interface LineaVenta {
  readonly idProducto: number;
  readonly cantidad: number;
}

/**
 * Reglas de forma de un documento de compra o venta.
 *
 * Existen aquí, y no solo en el procedimiento almacenado, porque el dominio
 * debe poder rechazar una operación inválida antes de consumir una conexión.
 * La validación en SQL sigue siendo la autoridad final sobre el stock: ésta es
 * la primera barrera, no la única.
 */
export class ReglasDocumento {
  static readonly MAX_LINEAS = 200;

  static validarLineasCompra(lineas: readonly LineaCompra[]): void {
    ReglasDocumento.validarCardinalidad(lineas.length, 'compra');

    for (const linea of lineas) {
      ReglasDocumento.validarProducto(linea.idProducto);

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
      ReglasDocumento.validarProducto(linea.idProducto);

      if (!Number.isFinite(linea.cantidad) || linea.cantidad <= 0) {
        throw new RangeError('Las cantidades de la venta deben ser mayores a cero.');
      }
    }
  }

  /**
   * Totales previstos por el dominio.
   *
   * Reutiliza el value object `Importe`, que concentra la fórmula del enunciado.
   * Sirve para verificar contra lo que devuelve la base: si divergieran, sería
   * señal de que la fórmula del código y la de SQL se desincronizaron.
   */
  static totalesPrevistos(
    lineas: readonly { cantidad: number; precio: number }[],
  ): { subTotal: number; igv: number; total: number } {
    return Importe.sumar(lineas.map((l) => Importe.calcular(l.cantidad, l.precio))).toJSON();
  }

  private static validarProducto(idProducto: number): void {
    if (!Number.isInteger(idProducto) || idProducto <= 0) {
      throw new RangeError('Cada linea debe referenciar un producto valido.');
    }
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
