import { Importe } from './importe.vo';

/**
 * Pruebas del value object Importe.
 *
 * Se ejecutan sin levantar Nest ni la base de datos: esa es precisamente la
 * ventaja concreta de mantener el dominio aislado en Clean Architecture.
 */
describe('Importe', () => {
  describe('calcular', () => {
    it('aplica la formula del enunciado: SubTotal = cantidad * precio', () => {
      // Arrange
      const cantidad = 50;
      const precio = 2.5;

      // Act
      const importe = Importe.calcular(cantidad, precio);

      // Assert
      expect(importe.subTotal).toBe(125);
    });

    /*
     * DESVIACION DELIBERADA respecto al enunciado, y esta prueba la fija.
     *
     * El examen escribe `Igv = Cantidad * Precio Venta * 1.18`, que convierte el
     * IGV en el 118 % del subtotal y el total en el 218 %. Se implementa el IGV
     * peruano vigente -18 % del valor de venta- porque este sistema factura
     * medicamentos y un comprobante mal calculado es un error tributario, no un
     * detalle de presentacion.
     *
     * Si alguien revierte el factor a 1.18, esta prueba lo detiene.
     */
    it('calcula el IGV como el 18 % del subtotal', () => {
      const importe = Importe.calcular(50, 2.5);

      // Subtotal 125 -> IGV 22.5
      expect(importe.igv).toBeCloseTo(22.5, 4);
    });

    it('NO aplica la formula literal del enunciado, que daria el 118 %', () => {
      const importe = Importe.calcular(50, 2.5);

      expect(importe.igv).not.toBeCloseTo(147.5, 4);
    });

    it('calcula el total como la suma de subtotal e IGV', () => {
      const importe = Importe.calcular(50, 2.5);

      expect(importe.total).toBe(importe.subTotal + importe.igv);
      expect(importe.total).toBeCloseTo(147.5, 4);
    });

    it('el total equivale al subtotal incrementado en un 18 %', () => {
      const importe = Importe.calcular(50, 2.5);

      expect(importe.total).toBeCloseTo(importe.subTotal * 1.18, 4);
    });

    it('redondea a 4 decimales sin arrastrar el sesgo del binario flotante', () => {
      // 0.1 * 3 en coma flotante da 0.30000000000000004
      const importe = Importe.calcular(3, 0.1);

      expect(importe.subTotal).toBeCloseTo(0.3, 4);
    });

    it('rechaza una cantidad igual a cero', () => {
      expect(() => Importe.calcular(0, 10)).toThrow(RangeError);
    });

    it('rechaza una cantidad negativa', () => {
      expect(() => Importe.calcular(-1, 10)).toThrow(RangeError);
    });

    it('rechaza un precio negativo', () => {
      expect(() => Importe.calcular(1, -10)).toThrow(RangeError);
    });

    it('acepta un precio de cero, valido para insumos donados o de muestra', () => {
      const importe = Importe.calcular(10, 0);

      expect(importe.subTotal).toBe(0);
      expect(importe.total).toBe(0);
    });

    it('rechaza valores no finitos', () => {
      expect(() => Importe.calcular(Number.NaN, 10)).toThrow(RangeError);
      expect(() => Importe.calcular(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    });
  });

  describe('sumar', () => {
    it('acumula varias lineas para obtener el total de la cabecera', () => {
      const lineas = [Importe.calcular(10, 1), Importe.calcular(5, 2)];

      const total = Importe.sumar(lineas);

      // 10x1 -> sub 10, igv 1.8 | 5x2 -> sub 10, igv 1.8
      expect(total.subTotal).toBe(20);
      expect(total.igv).toBeCloseTo(3.6, 4);
      expect(total.total).toBeCloseTo(23.6, 4);
    });

    it('devuelve ceros cuando no hay lineas', () => {
      const total = Importe.sumar([]);

      expect(total.subTotal).toBe(0);
      expect(total.igv).toBe(0);
      expect(total.total).toBe(0);
    });
  });

  describe('precioVentaDesdeCosto', () => {
    it('aplica el margen de 1.35 exigido por la seccion 1.2.1.a', () => {
      expect(Importe.precioVentaDesdeCosto(2)).toBeCloseTo(2.7, 4);
      expect(Importe.precioVentaDesdeCosto(0.45)).toBeCloseTo(0.6075, 4);
    });

    it('devuelve cero cuando el costo es cero', () => {
      expect(Importe.precioVentaDesdeCosto(0)).toBe(0);
    });

    it('rechaza un costo negativo', () => {
      expect(() => Importe.precioVentaDesdeCosto(-1)).toThrow(RangeError);
    });
  });

  describe('inmutabilidad', () => {
    it('no permite modificar una instancia ya creada', () => {
      const importe = Importe.calcular(10, 1);

      // El objeto esta congelado: la asignacion no surte efecto.
      expect(() => {
        (importe as unknown as { subTotal: number }).subTotal = 999;
      }).toThrow();

      expect(importe.subTotal).toBe(10);
    });
  });

  describe('equals', () => {
    it('compara por valor y no por identidad', () => {
      const a = Importe.calcular(10, 2);
      const b = Importe.calcular(10, 2);
      const c = Importe.calcular(10, 3);

      expect(a).not.toBe(b);
      expect(a.equals(b)).toBe(true);
      expect(a.equals(c)).toBe(false);
    });
  });
});
