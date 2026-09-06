import {
  CodigoError,
  type RegistroPuerto,
  type ResultadoPaginado,
} from '@hce/compartido';

import type {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../modelos/inventario.modelos';
import type { InventarioRepositorio } from '../puertos/salida/inventario.repositorio';

import { ListarComprasCasoUso } from './listar-compras.caso-uso';
import { ListarKardexCasoUso } from './listar-kardex.caso-uso';
import { ListarVentasCasoUso } from './listar-ventas.caso-uso';
import { MovimientosProductoCasoUso } from './movimientos-producto.caso-uso';
import { ObtenerCompraCasoUso } from './obtener-compra.caso-uso';
import { ObtenerVentaCasoUso } from './obtener-venta.caso-uso';
import { RegistrarCompraCasoUso } from './registrar-compra.caso-uso';

/**
 * Pruebas de los casos de uso del inventario que no tienen archivo propio.
 *
 * `registrar-venta` se prueba aparte por ser el mas critico. Aqui se cubren la
 * compra, los listados y el Kardex.
 */
describe('Casos de uso del inventario', () => {
  const COMPRA: DocumentoCompra = {
    idCompraCab: 1,
    fechaRegistro: new Date('2026-09-03T10:00:00Z'),
    subTotal: 125,
    igv: 147.5,
    total: 272.5,
    detalle: [],
  };

  const VENTA: DocumentoVenta = {
    idVentaCab: 1,
    fechaRegistro: new Date('2026-09-03T10:00:00Z'),
    subTotal: 10,
    igv: 11.8,
    total: 21.8,
    detalle: [],
  };

  const FILA_KARDEX: FilaKardex = {
    idProducto: 1,
    nombreProducto: 'Paracetamol',
    nroLote: 'LT-1',
    stockActual: 100,
    costo: 2,
    precioVenta: 2.7,
    valorizado: 200,
  };

  const MOVIMIENTO: MovimientoProducto = {
    idMovimientoDet: 1,
    fechaRegistro: new Date('2026-09-03T10:00:00Z'),
    tipoMovimiento: 'Entrada',
    idTipoMovimiento: 1,
    documentoOrigen: 1,
    cantidad: 50,
    saldo: 50,
  };

  function registroMudo(): RegistroPuerto {
    return {
      depurar: () => undefined,
      informar: () => undefined,
      advertir: () => undefined,
      error: () => undefined,
    };
  }

  interface Espia {
    consultas: unknown[];
    movimientos: unknown[];
  }

  function crearRepositorio(sobrescribir: Partial<InventarioRepositorio> = {}): {
    repositorio: InventarioRepositorio;
    espia: Espia;
  } {
    const espia: Espia = { consultas: [], movimientos: [] };

    const paginado = <T>(dato: T): ResultadoPaginado<T> => ({
      datos: [dato],
      meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 1, totalPaginas: 1 },
    });

    const repositorio: InventarioRepositorio = {
      registrarCompra: () => Promise.resolve(COMPRA),
      listarCompras: (consulta): Promise<ResultadoPaginado<ResumenCompra>> => {
        espia.consultas.push(consulta);
        return Promise.resolve(
          paginado({
            idCompraCab: 1,
            fechaRegistro: COMPRA.fechaRegistro,
            subTotal: 125,
            igv: 147.5,
            total: 272.5,
            items: 1,
          }),
        );
      },
      obtenerCompra: () => Promise.resolve(COMPRA),
      registrarVenta: () => Promise.resolve(VENTA),
      listarVentas: (consulta): Promise<ResultadoPaginado<ResumenVenta>> => {
        espia.consultas.push(consulta);
        return Promise.resolve(
          paginado({
            idVentaCab: 1,
            fechaRegistro: VENTA.fechaRegistro,
            subTotal: 10,
            igv: 11.8,
            total: 21.8,
            items: 1,
          }),
        );
      },
      obtenerVenta: () => Promise.resolve(VENTA),
      listarKardex: (consulta) => {
        espia.consultas.push(consulta);
        return Promise.resolve(paginado(FILA_KARDEX));
      },
      movimientosDeProducto: (idProducto, desde, hasta) => {
        espia.movimientos.push({ idProducto, desde, hasta });
        return Promise.resolve([MOVIMIENTO]);
      },
      ...sobrescribir,
    };

    return { repositorio, espia };
  }

  describe('RegistrarCompraCasoUso', () => {
    it('registra una compra valida', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new RegistrarCompraCasoUso(repositorio, registroMudo());

      const compra = await caso.ejecutar({
        lineas: [{ idProducto: 1, cantidad: 50, precio: 2.5 }],
      });

      expect(compra.idCompraCab).toBe(1);
    });

    it('rechaza una compra sin lineas', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new RegistrarCompraCasoUso(repositorio, registroMudo());

      await expect(caso.ejecutar({ lineas: [] })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
    });

    it('rechaza un costo unitario negativo', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new RegistrarCompraCasoUso(repositorio, registroMudo());

      await expect(
        caso.ejecutar({ lineas: [{ idProducto: 1, cantidad: 1, precio: -1 }] }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('acepta un costo de cero, valido para insumos donados', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new RegistrarCompraCasoUso(repositorio, registroMudo());

      await expect(
        caso.ejecutar({ lineas: [{ idProducto: 1, cantidad: 1, precio: 0 }] }),
      ).resolves.toBeDefined();
    });
  });

  describe('Listados', () => {
    it('ListarComprasCasoUso normaliza la paginacion', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarComprasCasoUso(repositorio);

      await caso.ejecutar({ tamanoPagina: 5000 });

      expect(espia.consultas[0]).toMatchObject({ pagina: 1, tamanoPagina: 200 });
    });

    it('ListarVentasCasoUso conserva el rango de fechas', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarVentasCasoUso(repositorio);

      await caso.ejecutar({ fechaDesde: '2026-01-01', fechaHasta: '2026-12-31' });

      expect(espia.consultas[0]).toMatchObject({
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-12-31',
      });
    });

    it('ListarKardexCasoUso normaliza la paginacion', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarKardexCasoUso(repositorio);

      await caso.ejecutar({ pagina: 0 });

      expect(espia.consultas[0]).toMatchObject({ pagina: 1 });
    });
  });

  describe('Obtencion de documentos', () => {
    it('ObtenerCompraCasoUso devuelve la compra', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ObtenerCompraCasoUso(repositorio);

      await expect(caso.ejecutar({ idCompraCab: 1 })).resolves.toMatchObject({
        idCompraCab: 1,
      });
    });

    it('ObtenerCompraCasoUso lanza NO_ENCONTRADO si no existe', async () => {
      const { repositorio } = crearRepositorio({
        obtenerCompra: () => Promise.resolve(null),
      });
      const caso = new ObtenerCompraCasoUso(repositorio);

      await expect(caso.ejecutar({ idCompraCab: 99 })).rejects.toMatchObject({
        codigo: CodigoError.NO_ENCONTRADO,
      });
    });

    it('ObtenerVentaCasoUso devuelve la venta', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ObtenerVentaCasoUso(repositorio);

      // El camino de exito, no solo el de fallo: un caso de uso que solo se
      // prueba cuando el documento no existe podria estar devolviendo cualquier
      // cosa cuando si existe.
      await expect(caso.ejecutar({ idVentaCab: 1 })).resolves.toBe(VENTA);
    });

    it('ObtenerVentaCasoUso lanza NO_ENCONTRADO si no existe', async () => {
      const { repositorio } = crearRepositorio({
        obtenerVenta: () => Promise.resolve(null),
      });
      const caso = new ObtenerVentaCasoUso(repositorio);

      await expect(caso.ejecutar({ idVentaCab: 99 })).rejects.toMatchObject({
        codigo: CodigoError.NO_ENCONTRADO,
      });
    });
  });

  describe('MovimientosProductoCasoUso', () => {
    it('devuelve los movimientos con su saldo acumulado', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new MovimientosProductoCasoUso(repositorio);

      const movimientos = await caso.ejecutar({ idProducto: 1 });

      expect(movimientos[0]).toMatchObject({ tipoMovimiento: 'Entrada', saldo: 50 });
    });

    it('propaga el rango de fechas al repositorio', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new MovimientosProductoCasoUso(repositorio);

      await caso.ejecutar({
        idProducto: 1,
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-06-30',
      });

      expect(espia.movimientos[0]).toEqual({
        idProducto: 1,
        desde: '2026-01-01',
        hasta: '2026-06-30',
      });
    });

    it('rechaza un identificador no valido sin consultar', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new MovimientosProductoCasoUso(repositorio);

      expect(() => caso.ejecutar({ idProducto: 0 })).toThrow();
      expect(espia.movimientos).toHaveLength(0);
    });
  });
});
