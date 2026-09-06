import { PATRONES_INVENTARIO } from '@hce/compartido';

import type { InventarioFachada } from '../../aplicacion/fachadas/inventario.fachada';

import { InventarioControlador } from './inventario.controlador';

/**
 * Pruebas del controlador RPC de inventario.
 *
 * El controlador no tiene logica: recibe el mensaje y llama a la fachada. Esa
 * ausencia de logica es la propiedad que se quiere proteger, porque es lo que
 * mantiene la capa de adaptadores fina y deja el negocio en la aplicacion.
 *
 * Lo unico que puede romperse aqui es el CABLEADO: que un metodo llame a la
 * operacion equivocada de la fachada, o que el mensaje no llegue intacto. Son
 * fallos que el compilador no ve cuando dos operaciones tienen firmas
 * parecidas, como registrar una compra y registrar una venta.
 *
 * Los patrones @MessagePattern se comprueban aparte, contra las constantes
 * compartidas: son cadenas, y una cadena mal escrita deja el endpoint mudo sin
 * que nada falle al compilar.
 */
describe('InventarioControlador (RPC)', () => {
  const fachada = () =>
    ({
      registrarCompra: jest.fn().mockResolvedValue({ idCompraCab: 1 }),
      listarCompras: jest.fn().mockResolvedValue({ datos: [], meta: {} }),
      obtenerCompra: jest.fn().mockResolvedValue({ idCompraCab: 1 }),
      registrarVenta: jest.fn().mockResolvedValue({ idVentaCab: 1 }),
      listarVentas: jest.fn().mockResolvedValue({ datos: [], meta: {} }),
      obtenerVenta: jest.fn().mockResolvedValue({ idVentaCab: 1 }),
      listarKardex: jest.fn().mockResolvedValue({ datos: [], meta: {} }),
      movimientosDeProducto: jest.fn().mockResolvedValue([]),
      // El controlador depende de la clase concreta de la fachada, que tiene
      // campos privados; el doble cumple su interfaz publica y la conversion lo
      // hace explicito en un solo punto.
    }) as unknown as jest.Mocked<InventarioFachada>;

  describe('compras', () => {
    it('registrar delega en la fachada con el mensaje intacto', async () => {
      const doble = fachada();
      const peticion = {
        lineas: [{ idProducto: 1, cantidad: 5, precio: 0.49 }],
        usuarioApp: 'farmacia',
      };

      await new InventarioControlador(doble).registrarCompra(peticion);

      expect(doble.registrarCompra).toHaveBeenCalledWith(peticion);
    });

    it('listar delega en la operacion de listado', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).listarCompras({ pagina: 1 });

      expect(doble.listarCompras).toHaveBeenCalledWith({ pagina: 1 });
    });

    it('obtener delega en la operacion de consulta', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).obtenerCompra({ idCompraCab: 3 });

      expect(doble.obtenerCompra).toHaveBeenCalledWith({ idCompraCab: 3 });
    });

    /*
     * Compra y venta tienen firmas casi identicas. Cruzar las llamadas
     * registraria una salida de stock donde iba una entrada, y el compilador no
     * diria nada porque los tipos encajan. De ahi la comprobacion negativa.
     */
    it('registrar una compra no toca la operacion de venta', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).registrarCompra({ lineas: [] });

      expect(doble.registrarVenta).not.toHaveBeenCalled();
    });
  });

  describe('ventas', () => {
    it('registrar delega en la fachada con el mensaje intacto', async () => {
      const doble = fachada();
      const peticion = {
        lineas: [{ idProducto: 1, cantidad: 2 }],
        usuarioApp: 'farmacia',
      };

      await new InventarioControlador(doble).registrarVenta(peticion);

      expect(doble.registrarVenta).toHaveBeenCalledWith(peticion);
    });

    it('listar delega en la operacion de listado', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).listarVentas({ pagina: 2 });

      expect(doble.listarVentas).toHaveBeenCalledWith({ pagina: 2 });
    });

    it('obtener delega en la operacion de consulta', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).obtenerVenta({ idVentaCab: 9 });

      expect(doble.obtenerVenta).toHaveBeenCalledWith({ idVentaCab: 9 });
    });

    it('registrar una venta no toca la operacion de compra', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).registrarVenta({ lineas: [] });

      expect(doble.registrarCompra).not.toHaveBeenCalled();
    });
  });

  describe('kardex', () => {
    it('listar delega en la fachada', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).listarKardex({ buscar: 'para' });

      expect(doble.listarKardex).toHaveBeenCalledWith({ buscar: 'para' });
    });

    it('los movimientos delegan en la fachada', async () => {
      const doble = fachada();

      await new InventarioControlador(doble).movimientos({ idProducto: 1 });

      expect(doble.movimientosDeProducto).toHaveBeenCalledWith({ idProducto: 1 });
    });
  });

  describe('respuestas', () => {
    it('devuelve lo que devuelve la fachada, sin transformarlo', async () => {
      const doble = fachada();
      const documento = {
        idCompraCab: 3,
        fechaRegistro: new Date('2026-09-04T10:00:00Z'),
        subTotal: 125,
        igv: 22.5,
        total: 147.5,
        detalle: [],
      };
      doble.obtenerCompra.mockResolvedValue(documento);

      await expect(
        new InventarioControlador(doble).obtenerCompra({ idCompraCab: 3 }),
      ).resolves.toBe(documento);
    });

    /*
     * El controlador no captura errores. Es correcto: el filtro de excepciones
     * RPC los serializa en el borde del microservicio, y capturarlos aqui
     * romperia esa traduccion y devolveria un 500 en lugar del 422 que toca.
     */
    it('deja subir el error de la fachada sin capturarlo', async () => {
      const doble = fachada();
      const fallo = new Error('Stock insuficiente');
      doble.registrarVenta.mockRejectedValue(fallo);

      await expect(
        new InventarioControlador(doble).registrarVenta({ lineas: [] }),
      ).rejects.toBe(fallo);
    });
  });

  describe('patrones de mensaje', () => {
    /*
     * Los ocho patrones se toman de la constante compartida, que es el unico
     * contrato entre el gateway y este microservicio. Si alguien escribiera el
     * patron a mano en cualquiera de los dos lados, el mensaje no llegaria a
     * ningun sitio y el fallo seria un timeout, no un error de compilacion.
     */
    it('los ocho patrones estan declarados y son distintos entre si', () => {
      const patrones = Object.values(PATRONES_INVENTARIO);

      expect(patrones).toHaveLength(8);
      expect(new Set(patrones).size).toBe(8);
    });

    it('todos los patrones llevan el prefijo del servicio', () => {
      // El prefijo es lo que permite leer una traza y saber a que servicio fue
      // el mensaje sin tener que buscar el patron en el codigo.
      for (const patron of Object.values(PATRONES_INVENTARIO)) {
        expect(patron).toMatch(/^inventario\.(compra|venta|kardex)\./);
      }
    });
  });
});
