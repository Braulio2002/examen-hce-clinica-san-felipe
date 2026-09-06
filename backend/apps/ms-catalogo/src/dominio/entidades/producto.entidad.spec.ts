import { Producto } from './producto.entidad';

/**
 * Pruebas de la entidad Producto.
 *
 * Lo que se protege aqui es la frontera del dominio con datos que vienen de
 * fuera. Los DTO del Gateway ya validan, pero la entidad no puede dar por hecho
 * que alguien lo hizo antes: si manana se anade otra via de entrada -una carga
 * masiva, una migracion, un mensaje de otro servicio- esta es la unica barrera
 * que sigue en pie.
 */
describe('Entidad Producto', () => {
  describe('validarAlta', () => {
    it('acepta un alta correcta', () => {
      expect(() => {
        Producto.validarAlta('Paracetamol 500 mg', 'LT-0001', 0.49);
      }).not.toThrow();
    });

    it('acepta costo cero: hay insumos donados', () => {
      expect(() => {
        Producto.validarAlta('Gasa', 'LT-0002', 0);
      }).not.toThrow();
    });

    describe('nombre', () => {
      it.each([undefined, '', '   ', '\t'])('rechaza %p', (nombre) => {
        expect(() => {
          Producto.validarAlta(nombre, 'LT-0001', 1);
        }).toThrow(RangeError);
      });

      it('explica cual es el campo que falta', () => {
        expect(() => {
          Producto.validarAlta('', 'LT-0001', 1);
        }).toThrow(/nombre/i);
      });
    });

    describe('numero de lote', () => {
      it.each([undefined, '', '  '])('rechaza %p', (lote) => {
        expect(() => {
          Producto.validarAlta('Paracetamol', lote, 1);
        }).toThrow(RangeError);
      });

      it('explica cual es el campo que falta', () => {
        expect(() => {
          Producto.validarAlta('Paracetamol', '  ', 1);
        }).toThrow(/lote/i);
      });
    });

    describe('costo', () => {
      it('rechaza un costo negativo', () => {
        expect(() => {
          Producto.validarAlta('Paracetamol', 'LT-0001', -1);
        }).toThrow(/negativo/i);
      });

      it('rechaza un costo ausente', () => {
        expect(() => {
          Producto.validarAlta('Paracetamol', 'LT-0001');
        }).toThrow(RangeError);
      });

      /*
       * NaN e Infinity merecen prueba propia. `Number('abc')` produce NaN, y NaN
       * compara false frente a cualquier valor: una comprobacion escrita como `!(costo >= 0)`
       * lo dejaria pasar. Por eso la entidad usa Number.isFinite.
       */
      it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
        'rechaza %p, que una comparacion ingenua dejaria pasar',
        (costo) => {
          expect(() => {
            Producto.validarAlta('Paracetamol', 'LT-0001', costo);
          }).toThrow(RangeError);
        },
      );
    });
  });

  describe('precioSugerido', () => {
    it('aplica el margen del enunciado', () => {
      expect(Producto.precioSugerido(10)).toBeCloseTo(13.5, 4);
    });

    it('un costo de cero da precio cero', () => {
      expect(Producto.precioSugerido(0)).toBe(0);
    });

    it('conserva la proporcion con decimales', () => {
      expect(Producto.precioSugerido(1.15)).toBeCloseTo(1.5525, 4);
    });
  });

  describe('rehidratar', () => {
    const datos = {
      id: 7,
      nombre: 'Guantes de Nitrilo Talla M',
      nroLote: 'LT-2026-0007',
      costo: 28.9,
      precioVenta: 39.015,
      fechaRegistro: new Date('2026-09-01T10:00:00Z'),
      activo: true,
    };

    it('reconstruye la entidad con todos sus campos', () => {
      expect(Producto.rehidratar(datos)).toMatchObject(datos);
    });

    it('devuelve una instancia de Producto, no un objeto plano', () => {
      expect(Producto.rehidratar(datos)).toBeInstanceOf(Producto);
    });

    /*
     * Rehidratar NO valida, y es deliberado: reconstruye lo que la base ya
     * acepto. Si validara, un dato antiguo que dejo de cumplir una regla nueva
     * haria estallar la lectura en lugar de dejar corregirlo.
     */
    it('no valida: reconstruye lo que la base ya acepto', () => {
      expect(() =>
        Producto.rehidratar({ ...datos, nombre: '', costo: -5 }),
      ).not.toThrow();
    });
  });
});
