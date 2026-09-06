import { describe, expect, it } from 'vitest';

import {
  FACTOR_IGV,
  MARGEN_PRECIO_VENTA,
  calcularImportes,
  formatearCantidad,
  formatearFecha,
  formatearMoneda,
  precioVentaDesdeCosto,
  sumarImportes,
} from './calculos';

/**
 * Pruebas de las formulas del enunciado en el cliente.
 *
 * Este archivo existe porque estas seis funciones puras concentran las formulas
 * de la seccion 1.2.2 y no tenian ninguna prueba: eran el codigo mas facil de
 * comprobar de todo el FrontEnd -sin React, sin DOM, sin red- y el unico con
 * consecuencias visibles para quien vende un medicamento.
 *
 * Lo que se protege no es el calculo en si, que el servidor rehace: es que la
 * cifra que el usuario ve mientras digita coincida con la que se va a cobrar.
 * Si divergen, el operador aprende a desconfiar de la pantalla, y eso es peor
 * que no mostrar nada.
 */
describe('Formulas de importes', () => {
  describe('las constantes son las del enunciado', () => {
    /*
     * Se comparan como texto y no con toBe.
     *
     * No es un rodeo caprichoso: el analizador prohibe la igualdad exacta entre
     * decimales, y con razon, porque 0.1 + 0.2 no es 0.3. Aqui no se compara un
     * resultado calculado sino el literal declarado, asi que la comparacion es
     * legitima -pero la regla no puede distinguirlo, y silenciarla por un caso
     * abriria la puerta a los que si son errores-.
     *
     * Comparar la representacion textual afirma exactamente lo que interesa:
     * que la constante dice 0.18, ni 0.180001 ni 0.2.
     */
    it('el IGV es del 18 %', () => {
      expect(String(FACTOR_IGV)).toBe('0.18');
    });

    it('el precio de venta lleva un margen de 1.35 sobre el costo', () => {
      expect(String(MARGEN_PRECIO_VENTA)).toBe('1.35');
    });
  });

  describe('calcularImportes', () => {
    /*
     * DESVIACION DELIBERADA respecto al enunciado, fijada aqui.
     *
     * El examen escribe `Igv = cantidad * precio * 1.18`, que hace del IGV el
     * 118 % del subtotal y del total el 218 %. Se aplica el IGV peruano vigente,
     * el 18 %. El motivo completo esta en `calculos.ts` y en el README.
     */
    it('aplica el IGV del 18 % sobre el subtotal', () => {
      // Subtotal = cantidad * precio        = 50
      // Igv      = subtotal * 0.18          = 9
      // Total    = subtotal + Igv           = 59
      const { subTotal, igv, total } = calcularImportes(5, 10);

      expect(subTotal).toBeCloseTo(50, 4);
      expect(igv).toBeCloseTo(9, 4);
      expect(total).toBeCloseTo(59, 4);
    });

    it('NO aplica la formula literal del enunciado, que daria el 118 %', () => {
      const { igv } = calcularImportes(5, 10);

      expect(igv).not.toBeCloseTo(59, 4);
    });

    it('el total equivale al subtotal incrementado en un 18 %', () => {
      const { subTotal, total } = calcularImportes(5, 10);

      expect(total).toBeCloseTo(subTotal * 1.18, 4);
    });

    it('el total es siempre la suma de subtotal e IGV', () => {
      const { subTotal, igv, total } = calcularImportes(3, 7.77);

      expect(total).toBeCloseTo(subTotal + igv, 4);
    });

    it('devuelve ceros con cantidad cero', () => {
      expect(calcularImportes(0, 10)).toMatchObject({ subTotal: 0, igv: 0, total: 0 });
    });

    it('no rompe con decimales de cantidad', () => {
      // Hay insumos que se despachan por fraccion (mililitros, gramos).
      const { subTotal } = calcularImportes(2.5, 4);

      expect(subTotal).toBeCloseTo(10, 4);
    });
  });

  describe('sumarImportes', () => {
    it('suma las tres columnas por separado', () => {
      const total = sumarImportes([calcularImportes(2, 10), calcularImportes(1, 5)]);

      // 2x10 -> sub 20, igv 3.6 | 1x5 -> sub 5, igv 0.9
      expect(total.subTotal).toBeCloseTo(25, 4);
      expect(total.igv).toBeCloseTo(4.5, 4);
      expect(total.total).toBeCloseTo(29.5, 4);
    });

    it('devuelve ceros sin lineas', () => {
      expect(sumarImportes([])).toMatchObject({ subTotal: 0, igv: 0, total: 0 });
    });

    it('el total sumado coincide con calcular el documento de una vez', () => {
      // Dos lineas del mismo producto deben dar lo mismo que una del doble.
      const porLineas = sumarImportes([calcularImportes(1, 9), calcularImportes(1, 9)]);
      const deUnaVez = calcularImportes(2, 9);

      expect(porLineas.total).toBeCloseTo(deUnaVez.total, 4);
    });
  });

  describe('precioVentaDesdeCosto', () => {
    it('aplica el margen del enunciado', () => {
      expect(precioVentaDesdeCosto(10)).toBeCloseTo(13.5, 4);
    });

    it('un costo de cero da precio cero', () => {
      expect(precioVentaDesdeCosto(0)).toBe(0);
    });

    it('coincide con lo que calcula la base de datos al registrar una compra', () => {
      // hce.fn_PrecioVentaDesdeCosto hace exactamente esto. Si alguien cambia
      // el margen en un sitio y no en el otro, la pantalla mentira al usuario.
      const costo = 1.15;

      expect(precioVentaDesdeCosto(costo)).toBeCloseTo(costo * MARGEN_PRECIO_VENTA, 4);
    });
  });

  describe('formateo para pantalla', () => {
    it('formatearMoneda incluye el simbolo de soles', () => {
      expect(formatearMoneda(1234.5)).toContain('S/');
    });

    it('formatearMoneda muestra dos decimales', () => {
      expect(formatearMoneda(2)).toMatch(/2[.,]00/);
    });

    it('formatearCantidad no arrastra ceros innecesarios', () => {
      expect(formatearCantidad(5)).toBe('5');
    });

    /*
     * Los formateadores y el calculo del precio blindan la entrada porque estan
     * al final de la cadena, justo antes de la pantalla. Un NaN que llegue hasta
     * aqui -de una division por cero, de un campo vacio, de un dato que la API
     * no envio- se muestra como "NaN" o "S/ NaN" en una tabla de importes. Es
     * peor que un cero: parece un fallo del sistema y nadie sabe de donde sale.
     */
    it.each([
      ['NaN', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
      ['un costo negativo', -5],
    ])('precioVentaDesdeCosto devuelve 0 ante %s', (_caso, entrada) => {
      expect(precioVentaDesdeCosto(entrada)).toBe(0);
    });

    it.each([
      ['NaN', Number.NaN],
      ['infinito', Number.POSITIVE_INFINITY],
    ])('formatearMoneda muestra cero ante %s, no el texto del fallo', (_caso, valor) => {
      expect(formatearMoneda(valor)).not.toMatch(/NaN|Infinity/);
      expect(formatearMoneda(valor)).toMatch(/0[.,]00/);
    });

    it.each([
      ['NaN', Number.NaN],
      ['infinito', Number.NEGATIVE_INFINITY],
    ])('formatearCantidad muestra cero ante %s', (_caso, valor) => {
      expect(formatearCantidad(valor)).toBe('0');
    });

    it('formatearCantidad conserva los decimales que importan', () => {
      expect(formatearCantidad(2.5)).toMatch(/2[.,]5/);
    });
  });

  /*
   * Las fechas llegan de la API como cadena ISO y de los formularios como
   * objeto Date. La funcion acepta las dos porque obligar a convertir en cada
   * punto de uso es garantizar que alguien lo olvide.
   */
  describe('formatearFecha', () => {
    it('formatea una cadena ISO al formato local', () => {
      const texto = formatearFecha('2026-09-03T14:30:00Z');

      expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('acepta tambien un objeto Date', () => {
      const texto = formatearFecha(new Date('2026-09-03T14:30:00Z'));

      expect(texto).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('incluye la hora, que es lo que distingue dos movimientos del mismo dia', () => {
      expect(formatearFecha('2026-09-03T14:30:00Z')).toMatch(/\d{2}:\d{2}/);
    });

    /*
     * Una fecha ilegible se muestra como un guion y no como "Invalid Date".
     * Puede llegar de un campo nulo o de un formato que el navegador no
     * reconoce; un guion en la celda se entiende, "Invalid Date" parece un
     * error del sistema.
     */
    it.each([
      ['una cadena que no es fecha', 'no soy una fecha'],
      ['una cadena vacia', ''],
      ['un Date invalido', new Date('x')],
    ])('muestra un guion ante %s', (_caso, valor) => {
      expect(formatearFecha(valor)).toBe('-');
    });
  });
});
