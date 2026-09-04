import { CodigoError, type ResultadoPaginado } from '@hce/compartido';

import type {
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../modelos/producto.modelos';
import type { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

import { RegistrarProductoCasoUso } from './registrar-producto.caso-uso';

/**
 * Pruebas del caso de uso de alta de producto.
 *
 * El caso interesante es el margen: el enunciado exige que el precio de venta
 * se derive del costo con el factor 1.35 cuando no se indica. Esa regla es la
 * que hay que blindar, porque un error ahi se propaga a cada venta posterior.
 */
describe('RegistrarProductoCasoUso', () => {
  function respuestaDe(peticion: RegistrarProductoPeticion): ProductoRespuesta {
    return {
      idProducto: 1,
      nombreProducto: peticion.nombreProducto,
      nroLote: peticion.nroLote,
      fechaRegistro: new Date('2026-09-03T10:00:00Z'),
      costo: peticion.costo,
      precioVenta: peticion.precioVenta ?? 0,
      stockActual: 0,
    };
  }

  function crearCaso() {
    const recibidas: RegistrarProductoPeticion[] = [];

    const repositorio: ProductoRepositorio = {
      registrar: (peticion) => {
        recibidas.push(peticion);
        return Promise.resolve(respuestaDe(peticion));
      },
      actualizar: (peticion) =>
        Promise.resolve(
          respuestaDe({
            nombreProducto: peticion.nombreProducto ?? '',
            nroLote: peticion.nroLote ?? '',
            costo: peticion.costo ?? 0,
            precioVenta: peticion.precioVenta,
          }),
        ),
      listar: (): Promise<ResultadoPaginado<ProductoRespuesta>> =>
        Promise.resolve({
          datos: [],
          meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 0, totalPaginas: 0 },
        }),
      obtener: () => Promise.resolve(null),
      eliminar: () => Promise.resolve(),
    };

    return { caso: new RegistrarProductoCasoUso(repositorio), recibidas };
  }

  describe('margen comercial del enunciado', () => {
    it('deriva el precio de venta como costo x 1.35 cuando no se indica', async () => {
      const { caso, recibidas } = crearCaso();

      await caso.ejecutar({ nombreProducto: 'Paracetamol', nroLote: 'LT-1', costo: 2 });

      expect(recibidas[0]?.precioVenta).toBeCloseTo(2.7, 4);
    });

    it('aplica el margen tambien a costos con decimales', async () => {
      const { caso, recibidas } = crearCaso();

      await caso.ejecutar({ nombreProducto: 'Gasa', nroLote: 'LT-2', costo: 0.45 });

      expect(recibidas[0]?.precioVenta).toBeCloseTo(0.6075, 4);
    });

    it('respeta el precio de venta cuando el usuario lo indica de forma explicita', async () => {
      const { caso, recibidas } = crearCaso();

      await caso.ejecutar({
        nombreProducto: 'Donacion',
        nroLote: 'LT-3',
        costo: 10,
        precioVenta: 0,
      });

      // Un precio de cero es legitimo (insumo donado) y no debe sustituirse por
      // el margen: `?? ` respeta el cero, `||` lo habria descartado.
      expect(recibidas[0]?.precioVenta).toBe(0);
    });

    it('acepta un costo de cero y deriva precio cero', async () => {
      const { caso, recibidas } = crearCaso();

      await caso.ejecutar({ nombreProducto: 'Muestra', nroLote: 'LT-4', costo: 0 });

      expect(recibidas[0]?.precioVenta).toBe(0);
    });
  });

  describe('validacion de entrada', () => {
    it('rechaza un nombre vacio', async () => {
      const { caso } = crearCaso();

      await expect(
        caso.ejecutar({ nombreProducto: '   ', nroLote: 'LT-1', costo: 1 }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('rechaza un numero de lote vacio', async () => {
      const { caso } = crearCaso();

      await expect(
        caso.ejecutar({ nombreProducto: 'Producto', nroLote: '', costo: 1 }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('rechaza un costo negativo', async () => {
      const { caso } = crearCaso();

      await expect(
        caso.ejecutar({ nombreProducto: 'Producto', nroLote: 'LT-1', costo: -1 }),
      ).rejects.toMatchObject({ codigo: CodigoError.VALIDACION });
    });

    it('no llega al repositorio cuando la entrada es invalida', async () => {
      const { caso, recibidas } = crearCaso();

      await caso
        .ejecutar({ nombreProducto: '', nroLote: '', costo: -5 })
        .catch(() => undefined);

      expect(recibidas).toHaveLength(0);
    });
  });
});
