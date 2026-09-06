import { ErrorInfraestructura } from '@hce/compartido';

import { InventarioMapeador } from './inventario.mapeador';

/**
 * Pruebas del mapeador de inventario.
 *
 * El mapeo es la parte mas propensa a errores silenciosos de todo el sistema.
 * Traduce nombres del enunciado -`Id_CompraCab`, `Sub_Total`, `fecRegistro`- al
 * vocabulario de la aplicacion, y una letra cambiada no rompe nada: devuelve
 * `undefined`, que en un importe se muestra vacio y en un identificador rompe
 * mucho mas tarde y muy lejos.
 *
 * Por eso las pruebas comparan el objeto ENTERO con `toEqual` en lugar de
 * comprobar campos sueltos: asi un campo que se deje de mapear hace fallar la
 * prueba en vez de pasar desapercibido.
 *
 * Nota sobre las mayusculas: la cabecera de compra usa `FecRegistro` y la de
 * venta `fecRegistro`, con minuscula. No es un descuido del codigo: son los
 * nombres literales que fija el enunciado, y el mapeador es justo el lugar donde
 * esa inconsistencia se absorbe para que no contamine el resto del sistema.
 */
describe('InventarioMapeador', () => {
  const detalleCrudo = {
    Id_producto: 1,
    Nombre_producto: 'Paracetamol 500 mg',
    NroLote: 'LT-2026-0001',
    Cantidad: 5,
    Precio: 0.66,
    Sub_Total: 3.3,
    Igv: 3.9,
    Total: 7.2,
  };

  describe('aDocumentoCompra', () => {
    const cabecera = {
      Id_CompraCab: 3,
      FecRegistro: new Date('2026-09-04T10:00:00Z'),
      SubTotal: 125,
      Igv: 147.5,
      Total: 272.5,
    };

    it('mapea la cabecera y el detalle completos', () => {
      const doc = InventarioMapeador.aDocumentoCompra(
        [cabecera],
        [{ ...detalleCrudo, Id_CompraDet: 11 }],
      );

      expect(doc).toEqual({
        idCompraCab: 3,
        fechaRegistro: cabecera.FecRegistro,
        subTotal: 125,
        igv: 147.5,
        total: 272.5,
        detalle: [
          {
            idDetalle: 11,
            idProducto: 1,
            nombreProducto: 'Paracetamol 500 mg',
            nroLote: 'LT-2026-0001',
            cantidad: 5,
            precio: 0.66,
            subTotal: 3.3,
            igv: 3.9,
            total: 7.2,
          },
        ],
      });
    });

    it('admite un documento sin lineas', () => {
      expect(InventarioMapeador.aDocumentoCompra([cabecera], undefined).detalle).toEqual(
        [],
      );
    });

    it('usa 0 como identificador de linea si el procedimiento no lo devuelve', () => {
      const doc = InventarioMapeador.aDocumentoCompra([cabecera], [detalleCrudo]);

      expect(doc.detalle[0]?.idDetalle).toBe(0);
    });

    /*
     * Sin cabecera el documento no existe. Fallar aqui, en el borde, es mucho
     * mejor que devolver un objeto con `undefined` en el identificador y que el
     * problema aparezca al intentar imprimir el comprobante.
     */
    it.each([[[]], [undefined]])('falla si no hay cabecera (%p)', (cabeceras) => {
      expect(() => InventarioMapeador.aDocumentoCompra(cabeceras, [])).toThrow(
        ErrorInfraestructura,
      );
    });

    it('el mensaje del fallo dice que falta la cabecera', () => {
      expect(() => InventarioMapeador.aDocumentoCompra([], [])).toThrow(/cabecera/i);
    });
  });

  describe('aDocumentoVenta', () => {
    const cabecera = {
      Id_VentaCab: 7,
      fecRegistro: new Date('2026-09-04T11:00:00Z'),
      SubTotal: 3.3,
      Igv: 3.9,
      Total: 7.2,
    };

    it('mapea la cabecera y el detalle completos', () => {
      const doc = InventarioMapeador.aDocumentoVenta(
        [cabecera],
        [{ ...detalleCrudo, Id_VentaDet: 22 }],
      );

      expect(doc).toEqual({
        idVentaCab: 7,
        fechaRegistro: cabecera.fecRegistro,
        subTotal: 3.3,
        igv: 3.9,
        total: 7.2,
        detalle: [expect.objectContaining({ idDetalle: 22, idProducto: 1 })],
      });
    });

    it('admite un documento sin lineas', () => {
      expect(InventarioMapeador.aDocumentoVenta([cabecera], undefined).detalle).toEqual(
        [],
      );
    });

    it('usa 0 como identificador de linea si el procedimiento no lo devuelve', () => {
      const doc = InventarioMapeador.aDocumentoVenta([cabecera], [detalleCrudo]);

      // Mismo criterio que en la compra: el identificador de linea solo lo
      // devuelven los procedimientos de consulta, no los de registro.
      expect(doc.detalle[0]?.idDetalle).toBe(0);
    });

    it('falla si no hay cabecera', () => {
      expect(() => InventarioMapeador.aDocumentoVenta([], [])).toThrow(
        ErrorInfraestructura,
      );
    });
  });

  describe('resumenes del listado', () => {
    it('aResumenCompra mapea todos los campos', () => {
      const fecha = new Date('2026-09-01T08:00:00Z');

      expect(
        InventarioMapeador.aResumenCompra({
          Id_CompraCab: 1,
          FecRegistro: fecha,
          SubTotal: 10,
          Igv: 11.8,
          Total: 21.8,
          Items: 3,
        }),
      ).toEqual({
        idCompraCab: 1,
        fechaRegistro: fecha,
        subTotal: 10,
        igv: 11.8,
        total: 21.8,
        items: 3,
      });
    });

    it('aResumenVenta mapea todos los campos', () => {
      const fecha = new Date('2026-09-02T08:00:00Z');

      expect(
        InventarioMapeador.aResumenVenta({
          Id_VentaCab: 2,
          fecRegistro: fecha,
          SubTotal: 5,
          Igv: 5.9,
          Total: 10.9,
          Items: 1,
        }),
      ).toEqual({
        idVentaCab: 2,
        fechaRegistro: fecha,
        subTotal: 5,
        igv: 5.9,
        total: 10.9,
        items: 1,
      });
    });

    it.each(['aResumenCompra', 'aResumenVenta'] as const)(
      '%s usa 0 cuando el conteo de items no viene',
      (metodo) => {
        const fila = {
          Id_CompraCab: 1,
          Id_VentaCab: 1,
          FecRegistro: new Date(),
          fecRegistro: new Date(),
          SubTotal: 0,
          Igv: 0,
          Total: 0,
        };

        expect(InventarioMapeador[metodo](fila).items).toBe(0);
      },
    );
  });

  describe('aFilaKardex', () => {
    it('mapea las columnas que exige el enunciado', () => {
      expect(
        InventarioMapeador.aFilaKardex({
          Id_producto: 1,
          Nombre_producto: 'Paracetamol 500 mg',
          NroLote: 'LT-2026-0001',
          Stock_actual: 680,
          Costo: 0.49,
          Precio_venta: 0.66,
          Valorizado: 333.2,
        }),
      ).toEqual({
        idProducto: 1,
        nombreProducto: 'Paracetamol 500 mg',
        nroLote: 'LT-2026-0001',
        stockActual: 680,
        costo: 0.49,
        precioVenta: 0.66,
        valorizado: 333.2,
      });
    });
  });

  describe('aMovimiento', () => {
    it('mapea el movimiento con su saldo acumulado', () => {
      const fecha = new Date('2026-09-03T09:00:00Z');

      expect(
        InventarioMapeador.aMovimiento({
          Id_MovimientoDet: 5,
          Fecha_registro: fecha,
          Tipo_movimiento: 'Entrada',
          Id_TipoMovimiento: 1,
          Documento_origen: 3,
          Cantidad: 50,
          Saldo: 730,
        }),
      ).toEqual({
        idMovimientoDet: 5,
        fechaRegistro: fecha,
        tipoMovimiento: 'Entrada',
        idTipoMovimiento: 1,
        documentoOrigen: 3,
        cantidad: 50,
        saldo: 730,
      });
    });
  });

  describe('totalRegistros', () => {
    /*
     * SQL Server repite el total en cada fila con COUNT(*) OVER (), de modo que
     * el listado y su total viajan en una sola ida a la base. Se lee de la
     * primera fila.
     */
    it('lo lee de la primera fila', () => {
      expect(
        InventarioMapeador.totalRegistros([
          { Total_registros: 13 },
          { Total_registros: 13 },
        ]),
      ).toBe(13);
    });

    it('devuelve 0 cuando el listado viene vacio', () => {
      expect(InventarioMapeador.totalRegistros([])).toBe(0);
    });

    it('devuelve 0 si el procedimiento no incluyo el total', () => {
      expect(InventarioMapeador.totalRegistros([{}])).toBe(0);
    });
  });
});
