import {
  type LineaCompra,
  type LineaVenta,
  ReglasDocumento,
} from './inventario.entidades';

/**
 * Pruebas de las reglas del agregado Inventario.
 *
 * Verifican la primera barrera de validacion, la que actua antes de consumir
 * una conexion a la base de datos. La validacion definitiva sigue siendo la del
 * procedimiento almacenado, que corre dentro de la transaccion con bloqueo.
 */
describe('ReglasDocumento', () => {
  const lineaCompraValida: LineaCompra = { idProducto: 1, cantidad: 10, precio: 2.5 };
  const lineaVentaValida: LineaVenta = { idProducto: 1, cantidad: 10 };

  describe('validarLineasCompra', () => {
    it('acepta un documento con lineas correctas', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([lineaCompraValida]);
      }).not.toThrow();
    });

    it('rechaza una compra sin lineas', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([]);
      }).toThrow(/al menos un producto/i);
    });

    it('rechaza una compra que supera el maximo de lineas permitido', () => {
      const demasiadas = Array.from(
        { length: ReglasDocumento.MAX_LINEAS + 1 },
        (_, i) => ({
          ...lineaCompraValida,
          idProducto: i + 1,
        }),
      );

      expect(() => {
        ReglasDocumento.validarLineasCompra(demasiadas);
      }).toThrow(/lineas de detalle/i);
    });

    it('rechaza una cantidad igual a cero', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, cantidad: 0 }]);
      }).toThrow(/mayores a cero/i);
    });

    it('rechaza una cantidad negativa', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, cantidad: -5 }]);
      }).toThrow(/mayores a cero/i);
    });

    it('rechaza un costo unitario negativo', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, precio: -1 }]);
      }).toThrow(/no puede ser negativo/i);
    });

    it('acepta un costo de cero, valido para insumos donados', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, precio: 0 }]);
      }).not.toThrow();
    });

    it('rechaza un identificador de producto que no es entero positivo', () => {
      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, idProducto: 0 }]);
      }).toThrow(/producto valido/i);

      expect(() => {
        ReglasDocumento.validarLineasCompra([{ ...lineaCompraValida, idProducto: 1.5 }]);
      }).toThrow(/producto valido/i);
    });
  });

  describe('validarLineasVenta', () => {
    it('acepta un documento con lineas correctas', () => {
      expect(() => {
        ReglasDocumento.validarLineasVenta([lineaVentaValida]);
      }).not.toThrow();
    });

    it('rechaza una venta sin lineas', () => {
      expect(() => {
        ReglasDocumento.validarLineasVenta([]);
      }).toThrow(/al menos un producto/i);
    });

    it('rechaza una cantidad no positiva', () => {
      expect(() => {
        ReglasDocumento.validarLineasVenta([{ ...lineaVentaValida, cantidad: 0 }]);
      }).toThrow(/mayores a cero/i);
    });

    it('rechaza un identificador de producto invalido', () => {
      expect(() => {
        ReglasDocumento.validarLineasVenta([{ ...lineaVentaValida, idProducto: -1 }]);
      }).toThrow(/producto valido/i);
    });
  });

  describe('totalesPrevistos', () => {
    it('coincide con la formula aplicada (IGV del 18 %)', () => {
      const totales = ReglasDocumento.totalesPrevistos([
        { cantidad: 50, precio: 2.5 },
        { cantidad: 10, precio: 1 },
      ]);

      // SubTotal: 125 + 10 = 135
      expect(totales.subTotal).toBe(135);
      // Igv: 22.5 + 1.8 = 24.3
      expect(totales.igv).toBeCloseTo(24.3, 4);
      expect(totales.total).toBeCloseTo(159.3, 4);
    });
  });
});
