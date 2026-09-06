import { ProductoMapeador } from './producto.mapeador';

/**
 * Pruebas del mapeador de productos.
 *
 * Traduce los nombres del enunciado -`Id_producto`, `Nombre_producto`,
 * `NroLote`- al vocabulario de la aplicacion. Se comprueba el objeto entero con
 * `toEqual` y no campo a campo: asi, si alguien anade una columna al
 * procedimiento y olvida mapearla, la prueba lo dice.
 */
describe('ProductoMapeador', () => {
  const fila = {
    Id_producto: 1,
    Nombre_producto: 'Paracetamol 500 mg Tableta',
    NroLote: 'LT-2026-0001',
    Fec_registro: new Date('2026-09-01T08:00:00Z'),
    Costo: 0.49,
    PrecioVenta: 0.6615,
    Stock_actual: 680,
    Total_registros: 13,
  };

  describe('aRespuesta', () => {
    it('mapea todos los campos al vocabulario de la aplicacion', () => {
      expect(ProductoMapeador.aRespuesta(fila)).toEqual({
        idProducto: 1,
        nombreProducto: 'Paracetamol 500 mg Tableta',
        nroLote: 'LT-2026-0001',
        fechaRegistro: fila.Fec_registro,
        costo: 0.49,
        precioVenta: 0.6615,
        stockActual: 680,
      });
    });

    /*
     * El stock solo viene en los procedimientos que consultan la vista de
     * existencias. Al registrar o actualizar un producto no llega, y ahi 0 es la
     * respuesta correcta: un producto recien creado no tiene movimientos.
     */
    it('usa 0 cuando el procedimiento no devuelve stock', () => {
      const sinStock = { ...fila };
      delete (sinStock as Partial<typeof fila>).Stock_actual;

      expect(ProductoMapeador.aRespuesta(sinStock).stockActual).toBe(0);
    });

    it('distingue el stock cero de la ausencia de stock', () => {
      expect(ProductoMapeador.aRespuesta({ ...fila, Stock_actual: 0 }).stockActual).toBe(
        0,
      );
    });

    it('no arrastra el total de registros a la respuesta', () => {
      // Total_registros es metadato de paginacion, no un atributo del producto.
      expect(ProductoMapeador.aRespuesta(fila)).not.toHaveProperty('totalRegistros');
    });
  });

  describe('aRespuestas', () => {
    it('mapea una lista conservando el orden', () => {
      const salida = ProductoMapeador.aRespuestas([
        fila,
        { ...fila, Id_producto: 2, Nombre_producto: 'Ibuprofeno 400 mg' },
      ]);

      expect(salida).toHaveLength(2);
      expect(salida.map((p) => p.idProducto)).toEqual([1, 2]);
      expect(salida[1]?.nombreProducto).toBe('Ibuprofeno 400 mg');
    });

    it('devuelve una lista vacia sin filas', () => {
      expect(ProductoMapeador.aRespuestas([])).toEqual([]);
    });
  });

  describe('totalRegistros', () => {
    it('lo lee de la primera fila', () => {
      expect(ProductoMapeador.totalRegistros([fila, fila])).toBe(13);
    });

    it('devuelve 0 con el listado vacio', () => {
      expect(ProductoMapeador.totalRegistros([])).toBe(0);
    });

    it('devuelve 0 si el procedimiento no lo incluyo', () => {
      const sinTotal = { ...fila };
      delete (sinTotal as Partial<typeof fila>).Total_registros;

      expect(ProductoMapeador.totalRegistros([sinTotal])).toBe(0);
    });
  });
});
