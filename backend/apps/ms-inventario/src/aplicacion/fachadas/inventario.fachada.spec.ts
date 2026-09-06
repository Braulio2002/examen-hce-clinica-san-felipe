import { InventarioFachada } from './inventario.fachada';

/**
 * Pruebas del patron Facade de inventario.
 *
 * Ocho casos de uso detras de una interfaz, y cuatro de ellos van por parejas
 * casi identicas: registrar compra y registrar venta, listar compras y listar
 * ventas, obtener compra y obtener venta. Sus firmas son intercambiables para el
 * compilador.
 *
 * Ese es el riesgo real que esta prueba cubre. Si `registrarVenta` acabara
 * llamando al caso de uso de compra, el sistema generaria un movimiento de
 * Entrada en lugar de Salida: el stock subiria al vender. Nada fallaria, ni el
 * compilador ni el linter, y el descuadre saldria semanas despues.
 *
 * Por eso cada prueba afirma dos cosas: que se llamo al caso de uso correcto, y
 * que su gemelo NO se llamo.
 */
describe('InventarioFachada', () => {
  const dobles = () => ({
    registrarCompra: { ejecutar: jest.fn().mockResolvedValue('compra') },
    listarCompras: { ejecutar: jest.fn().mockResolvedValue('compras') },
    obtenerCompra: { ejecutar: jest.fn().mockResolvedValue('unaCompra') },
    registrarVenta: { ejecutar: jest.fn().mockResolvedValue('venta') },
    listarVentas: { ejecutar: jest.fn().mockResolvedValue('ventas') },
    obtenerVenta: { ejecutar: jest.fn().mockResolvedValue('unaVenta') },
    listarKardex: { ejecutar: jest.fn().mockResolvedValue('kardex') },
    movimientos: { ejecutar: jest.fn().mockResolvedValue('movimientos') },
  });

  const construir = (d: ReturnType<typeof dobles>) =>
    new InventarioFachada(
      d.registrarCompra,
      d.listarCompras,
      d.obtenerCompra,
      d.registrarVenta,
      d.listarVentas,
      d.obtenerVenta,
      d.listarKardex,
      d.movimientos,
    );

  describe('compras', () => {
    it('registrarCompra llama al caso de uso de compra, no al de venta', async () => {
      const d = dobles();
      const peticion = { lineas: [{ idProducto: 1, cantidad: 2, precio: 3 }] };

      await expect(construir(d).registrarCompra(peticion)).resolves.toBe('compra');

      expect(d.registrarCompra.ejecutar).toHaveBeenCalledWith(peticion);
      // El cruce que generaria una Salida donde debe haber una Entrada.
      expect(d.registrarVenta.ejecutar).not.toHaveBeenCalled();
    });

    it('listarCompras no toca el listado de ventas', async () => {
      const d = dobles();

      await expect(construir(d).listarCompras({ pagina: 1 })).resolves.toBe('compras');

      expect(d.listarCompras.ejecutar).toHaveBeenCalledWith({ pagina: 1 });
      expect(d.listarVentas.ejecutar).not.toHaveBeenCalled();
    });

    it('obtenerCompra no devuelve una venta', async () => {
      const d = dobles();

      await expect(construir(d).obtenerCompra({ idCompraCab: 5 })).resolves.toBe(
        'unaCompra',
      );

      expect(d.obtenerCompra.ejecutar).toHaveBeenCalledWith({ idCompraCab: 5 });
      expect(d.obtenerVenta.ejecutar).not.toHaveBeenCalled();
    });
  });

  describe('ventas', () => {
    it('registrarVenta llama al caso de uso de venta, no al de compra', async () => {
      const d = dobles();
      const peticion = { lineas: [{ idProducto: 1, cantidad: 2 }] };

      await expect(construir(d).registrarVenta(peticion)).resolves.toBe('venta');

      expect(d.registrarVenta.ejecutar).toHaveBeenCalledWith(peticion);
      expect(d.registrarCompra.ejecutar).not.toHaveBeenCalled();
    });

    it('listarVentas no toca el listado de compras', async () => {
      const d = dobles();

      await expect(construir(d).listarVentas({ pagina: 2 })).resolves.toBe('ventas');

      expect(d.listarVentas.ejecutar).toHaveBeenCalledWith({ pagina: 2 });
      expect(d.listarCompras.ejecutar).not.toHaveBeenCalled();
    });

    it('obtenerVenta no devuelve una compra', async () => {
      const d = dobles();

      await expect(construir(d).obtenerVenta({ idVentaCab: 8 })).resolves.toBe(
        'unaVenta',
      );

      expect(d.obtenerVenta.ejecutar).toHaveBeenCalledWith({ idVentaCab: 8 });
      expect(d.obtenerCompra.ejecutar).not.toHaveBeenCalled();
    });
  });

  describe('kardex', () => {
    it('listarKardex delega en su caso de uso', async () => {
      const d = dobles();

      await expect(construir(d).listarKardex({ pagina: 1 })).resolves.toBe('kardex');

      expect(d.listarKardex.ejecutar).toHaveBeenCalledWith({ pagina: 1 });
      expect(d.movimientos.ejecutar).not.toHaveBeenCalled();
    });

    it('movimientosDeProducto delega en su caso de uso', async () => {
      const d = dobles();

      await expect(construir(d).movimientosDeProducto({ idProducto: 3 })).resolves.toBe(
        'movimientos',
      );

      expect(d.movimientos.ejecutar).toHaveBeenCalledWith({ idProducto: 3 });
      expect(d.listarKardex.ejecutar).not.toHaveBeenCalled();
    });
  });

  it('propaga el fallo del caso de uso sin envolverlo', async () => {
    const d = dobles();
    const fallo = new Error('stock insuficiente');
    d.registrarVenta.ejecutar.mockRejectedValue(fallo);

    // Traducir el error es tarea del filtro de la capa de adaptadores, que sabe
    // que un rechazo de negocio es un 422 y no un 500.
    await expect(construir(d).registrarVenta({ lineas: [] })).rejects.toBe(fallo);
  });
});
