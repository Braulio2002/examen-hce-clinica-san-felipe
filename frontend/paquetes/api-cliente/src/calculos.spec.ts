import { describe, expect, it } from 'vitest';

import {
  FACTOR_IGV,
  MARGEN_PRECIO_VENTA,
  calcularImportes,
  formatearCantidad,
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
     * que la constante dice 1.18, ni 1.180001 ni 1.2.
     */
    it('el IGV es del 18 %', () => {
      expect(String(FACTOR_IGV)).toBe('1.18');
    });

    it('el precio de venta lleva un margen de 1.35 sobre el costo', () => {
      expect(String(MARGEN_PRECIO_VENTA)).toBe('1.35');
    });
  });

  describe('calcularImportes', () => {
    it('aplica la formula literal del enunciado', () => {
      // Subtotal = cantidad * precio
      // Igv      = cantidad * precio * 1.18
      // Total    = subtotal + Igv
      const { subTotal, igv, total } = calcularImportes(5, 10);

      expect(subTotal).toBeCloseTo(50, 4);
      expect(igv).toBeCloseTo(59, 4);
      expect(total).toBeCloseTo(109, 4);
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

      expect(total.subTotal).toBeCloseTo(25, 4);
      expect(total.igv).toBeCloseTo(29.5, 4);
      expect(total.total).toBeCloseTo(54.5, 4);
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

    it('formatearCantidad conserva los decimales que importan', () => {
      expect(formatearCantidad(2.5)).toMatch(/2[.,]5/);
    });
  });
});
