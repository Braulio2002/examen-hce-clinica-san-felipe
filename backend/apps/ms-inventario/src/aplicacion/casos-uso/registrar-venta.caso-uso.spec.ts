import {
  CodigoError,
  ErrorStockInsuficiente,
  type RegistroPuerto,
} from '@hce/compartido';

import type { LineaVenta } from '../../dominio/entidades/inventario.entidades';
import type { DocumentoVenta } from '../modelos/inventario.modelos';
import type { VentaRepositorio } from '../puertos/salida/inventario.repositorio';

import { RegistrarVentaCasoUso } from './registrar-venta.caso-uso';

/**
 * Pruebas del caso de uso de registro de venta.
 *
 * Verifican la responsabilidad que le corresponde: validar la forma del
 * documento y propagar el resultado. La validacion de STOCK no se prueba aqui
 * porque no vive aqui: ocurre dentro de la transaccion con bloqueo del
 * procedimiento almacenado, y se cubre en `99-pruebas-verificacion.sql` y en la
 * prueba de humo. Lo que si se comprueba es que el error del servidor llega al
 * llamante sin alterarse.
 */
describe('RegistrarVentaCasoUso', () => {
  const LINEA_VALIDA: LineaVenta = { idProducto: 1, cantidad: 10 };

  function documentoDePrueba(): DocumentoVenta {
    return {
      idVentaCab: 7,
      fechaRegistro: new Date('2026-09-03T10:00:00Z'),
      subTotal: 100,
      igv: 118,
      total: 218,
      detalle: [
        {
          idDetalle: 1,
          idProducto: 1,
          nombreProducto: 'Paracetamol 500 mg',
          nroLote: 'LT-1',
          cantidad: 10,
          precio: 10,
          subTotal: 100,
          igv: 118,
          total: 218,
        },
      ],
    };
  }

  function registroMudo(): RegistroPuerto {
    return {
      depurar: () => undefined,
      informar: () => undefined,
      advertir: () => undefined,
      error: () => undefined,
    };
  }

  function crearCaso(repositorio: Partial<VentaRepositorio>) {
    const completo: VentaRepositorio = {
      registrarVenta: () => Promise.resolve(documentoDePrueba()),
      listarVentas: () =>
        Promise.resolve({
          datos: [],
          meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 0, totalPaginas: 0 },
        }),
      obtenerVenta: () => Promise.resolve(null),
      ...repositorio,
    };
    return new RegistrarVentaCasoUso(completo, registroMudo());
  }

  describe('documento valido', () => {
    it('devuelve la venta registrada por el servidor', async () => {
      const caso = crearCaso({});

      const venta = await caso.ejecutar({ lineas: [LINEA_VALIDA] });

      expect(venta.idVentaCab).toBe(7);
      expect(venta.detalle).toHaveLength(1);
    });

    it('propaga el usuario de aplicacion para la auditoria', async () => {
      const usuariosRecibidos: (string | undefined)[] = [];
      const caso = crearCaso({
        registrarVenta: (_lineas, usuarioApp) => {
          usuariosRecibidos.push(usuarioApp);
          return Promise.resolve(documentoDePrueba());
        },
      });

      await caso.ejecutar({ lineas: [LINEA_VALIDA], usuarioApp: 'farmacia' });

      expect(usuariosRecibidos).toEqual(['farmacia']);
    });

    it('no altera las lineas que recibe', async () => {
      const lineasEnviadas: readonly LineaVenta[][] = [];
      const recibidas: LineaVenta[][] = [];
      const caso = crearCaso({
        registrarVenta: (lineas) => {
          recibidas.push([...lineas]);
          return Promise.resolve(documentoDePrueba());
        },
      });

      await caso.ejecutar({ lineas: [LINEA_VALIDA, { idProducto: 2, cantidad: 5 }] });

      expect(lineasEnviadas).toHaveLength(0);
      expect(recibidas[0]).toEqual([
        { idProducto: 1, cantidad: 10 },
        { idProducto: 2, cantidad: 5 },
      ]);
    });
  });

  describe('documento invalido: no llega a tocar el repositorio', () => {
    it('rechaza una venta sin lineas', async () => {
      let seLlamoAlRepositorio = false;
      const caso = crearCaso({
        registrarVenta: () => {
          seLlamoAlRepositorio = true;
          return Promise.resolve(documentoDePrueba());
        },
      });

      await expect(caso.ejecutar({ lineas: [] })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
      expect(seLlamoAlRepositorio).toBe(false);
    });

    it('rechaza una cantidad de cero', async () => {
      const caso = crearCaso({});

      await expect(
        caso.ejecutar({ lineas: [{ idProducto: 1, cantidad: 0 }] }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('rechaza una cantidad negativa', async () => {
      const caso = crearCaso({});

      await expect(
        caso.ejecutar({ lineas: [{ idProducto: 1, cantidad: -3 }] }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('rechaza un identificador de producto no entero', async () => {
      const caso = crearCaso({});

      await expect(
        caso.ejecutar({ lineas: [{ idProducto: 1.5, cantidad: 1 }] }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('rechaza un documento con mas de 200 lineas', async () => {
      const caso = crearCaso({});
      const demasiadas = Array.from({ length: 201 }, (_, i) => ({
        idProducto: i + 1,
        cantidad: 1,
      }));

      await expect(caso.ejecutar({ lineas: demasiadas })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
    });
  });

  describe('stock insuficiente', () => {
    it('propaga el error del servidor sin convertirlo en otra cosa', async () => {
      /*
       * Este es el comportamiento que importa: el caso de uso no intenta
       * interpretar ni reformular el rechazo por stock. Si lo hiciera, el
       * Gateway dejaria de devolver 422 y el FrontEnd no podria distinguir
       * "no hay existencias" de "fallo el sistema".
       */
      const caso = crearCaso({
        registrarVenta: () =>
          Promise.reject(
            new ErrorStockInsuficiente(
              'Stock insuficiente para [Paracetamol]. Disponible: 5.',
            ),
          ),
      });

      await expect(caso.ejecutar({ lineas: [LINEA_VALIDA] })).rejects.toMatchObject({
        codigo: CodigoError.STOCK_INSUFICIENTE,
      });
    });
  });
});
