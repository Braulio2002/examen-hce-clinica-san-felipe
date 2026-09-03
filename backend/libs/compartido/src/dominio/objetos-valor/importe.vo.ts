/**
 * Value Object que encapsula el calculo de importes de una linea de compra o
 * venta.
 *
 * REGLA DEL ENUNCIADO (seccion 1.2.2, literales b/c/d)
 * ---------------------------------------------------
 *      Subtotal = Cantidad * Precio Venta
 *      Igv      = Cantidad * Precio Venta * 1.18
 *      Total    = Subtotal + Igv
 *
 * Se implementa LITERALMENTE. Observacion tecnica documentada: con esa formula
 * el IGV equivale al 118 % del subtotal y el total al 218 %, mientras que el
 * IGV peruano vigente es el 18 % del valor de venta
 * (Igv = SubTotal * 0.18  ->  Total = SubTotal * 1.18).
 *
 * La formula existe en dos lugares y solo dos: aqui y en la funcion SQL
 * hce.fn_CalcularImportes. Ambos estan cubiertos por pruebas que comparan sus
 * resultados, de modo que no pueden divergir sin que falle la suite.
 *
 * Es un value object inmutable: no tiene identidad, se compara por valor y
 * cualquier operacion devuelve una instancia nueva.
 */
export class Importe {
  /** Factor de IGV tal como lo define el enunciado. */
  static readonly FACTOR_IGV = 1.18;

  /** Margen comercial aplicado sobre el costo de compra (seccion 1.2.1.a). */
  static readonly MARGEN_PRECIO_VENTA = 1.35;

  /** Numero de decimales con el que persiste la base de datos (DECIMAL(18,4)). */
  static readonly DECIMALES = 4;

  private constructor(
    readonly subTotal: number,
    readonly igv: number,
    readonly total: number,
  ) {
    Object.freeze(this);
  }

  /**
   * Calcula los importes de una linea.
   * @throws {RangeError} si la cantidad no es positiva o el precio es negativo.
   */
  static calcular(cantidad: number, precio: number): Importe {
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new RangeError('La cantidad debe ser un numero mayor a cero.');
    }
    if (!Number.isFinite(precio) || precio < 0) {
      throw new RangeError('El precio no puede ser negativo.');
    }

    const subTotal = Importe.redondear(cantidad * precio);
    const igv = Importe.redondear(cantidad * precio * Importe.FACTOR_IGV);
    const total = Importe.redondear(subTotal + igv);

    return new Importe(subTotal, igv, total);
  }

  /** Suma varias lineas para obtener los totales de la cabecera. */
  static sumar(importes: readonly Importe[]): Importe {
    const acumulado = importes.reduce(
      (acc, i) => ({
        subTotal: acc.subTotal + i.subTotal,
        igv: acc.igv + i.igv,
        total: acc.total + i.total,
      }),
      { subTotal: 0, igv: 0, total: 0 },
    );

    return new Importe(
      Importe.redondear(acumulado.subTotal),
      Importe.redondear(acumulado.igv),
      Importe.redondear(acumulado.total),
    );
  }

  /** Precio de venta derivado del costo de compra: Costo * 1.35. */
  static precioVentaDesdeCosto(costo: number): number {
    if (!Number.isFinite(costo) || costo < 0) {
      throw new RangeError('El costo no puede ser negativo.');
    }
    return Importe.redondear(costo * Importe.MARGEN_PRECIO_VENTA);
  }

  equals(otro: Importe): boolean {
    return (
      this.subTotal === otro.subTotal && this.igv === otro.igv && this.total === otro.total
    );
  }

  toJSON(): { subTotal: number; igv: number; total: number } {
    return { subTotal: this.subTotal, igv: this.igv, total: this.total };
  }

  /**
   * Redondeo a 4 decimales evitando el sesgo del binario flotante.
   * Number.EPSILON compensa casos como 1.005 -> 1.00499999999999989.
   */
  private static redondear(valor: number): number {
    const factor = 10 ** Importe.DECIMALES;
    return Math.round((valor + Number.EPSILON) * factor) / factor;
  }
}
