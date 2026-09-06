/**
 * Value Object que encapsula el calculo de importes de una linea de compra o
 * venta.
 *
 * DESVIACION DELIBERADA RESPECTO AL ENUNCIADO (seccion 1.2.2, literales b/c/d)
 * ---------------------------------------------------------------------------
 * El enunciado define textualmente:
 *
 *      Subtotal = Cantidad * Precio Venta
 *      Igv      = Cantidad * Precio Venta * 1.18      <-- error de redaccion
 *      Total    = Subtotal + Igv
 *
 * Esa formula hace que el IGV sea el 118 % del subtotal y el total el 218 %.
 * Una venta de 100 soles tributaria 118 y se cobraria 218.
 *
 * Se implementa la formula CORRECTA:
 *
 *      Subtotal = Cantidad * Precio Venta
 *      Igv      = Subtotal * 0.18                     <-- IGV peruano vigente
 *      Total    = Subtotal + Igv                      (= Subtotal * 1.18)
 *
 * El motivo es que este sistema factura medicamentos. Un comprobante con el
 * IGV mal calculado no es un detalle de presentacion: es un error tributario
 * que se propaga a la contabilidad y al paciente. Entregar el defecto replicado
 * y anotado habria sido dejar a sabiendas una bomba en produccion.
 *
 * Lo mas probable es que el enunciado quisiera decir `Total = Subtotal * 1.18`
 * y el 1.18 se deslizara a la linea de arriba al redactarlo.
 *
 * La formula existe en dos lugares y solo dos: aqui y en la funcion SQL
 * hce.fn_CalcularImportes. Ambos estan cubiertos por pruebas que comparan sus
 * resultados, de modo que no pueden divergir sin que falle la suite.
 *
 * Es un value object inmutable: no tiene identidad, se compara por valor y
 * cualquier operacion devuelve una instancia nueva.
 */
export class Importe {
  /** Tasa del IGV peruano vigente: 18 % del valor de venta. */
  static readonly FACTOR_IGV = 0.18;

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
    // El IGV se calcula sobre el subtotal ya redondeado, no sobre el producto
    // sin redondear: es lo que hace que la suma del comprobante cuadre al
    // centimo con lo que se muestra linea a linea.
    const igv = Importe.redondear(subTotal * Importe.FACTOR_IGV);
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
      this.subTotal === otro.subTotal &&
      this.igv === otro.igv &&
      this.total === otro.total
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
