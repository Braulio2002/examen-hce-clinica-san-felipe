import { CodigoError, type ResultadoPaginado } from '@hce/compartido';

import type { ProductoRespuesta } from '../modelos/producto.modelos';
import type { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

import { ActualizarProductoCasoUso } from './actualizar-producto.caso-uso';
import { EliminarProductoCasoUso } from './eliminar-producto.caso-uso';
import { ListarProductosCasoUso } from './listar-productos.caso-uso';
import { ObtenerProductoCasoUso } from './obtener-producto.caso-uso';

/**
 * Pruebas de los cuatro casos de uso restantes del catalogo.
 *
 * Se agrupan en un archivo porque comparten el mismo doble de repositorio y
 * porque cada uno tiene poca logica propia: lo que se verifica es que la
 * delegacion es correcta y que las validaciones de frontera no dejan pasar
 * entradas invalidas al repositorio.
 */
describe('Casos de uso del catalogo', () => {
  const PRODUCTO: ProductoRespuesta = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-1',
    fechaRegistro: new Date('2026-09-03T10:00:00Z'),
    costo: 2,
    precioVenta: 2.7,
    stockActual: 100,
  };

  interface Espia {
    actualizaciones: unknown[];
    listados: unknown[];
    eliminados: number[];
  }

  function crearRepositorio(sobrescribir: Partial<ProductoRepositorio> = {}): {
    repositorio: ProductoRepositorio;
    espia: Espia;
  } {
    const espia: Espia = { actualizaciones: [], listados: [], eliminados: [] };

    const repositorio: ProductoRepositorio = {
      registrar: () => Promise.resolve(PRODUCTO),
      actualizar: (peticion) => {
        espia.actualizaciones.push(peticion);
        return Promise.resolve(PRODUCTO);
      },
      listar: (peticion): Promise<ResultadoPaginado<ProductoRespuesta>> => {
        espia.listados.push(peticion);
        return Promise.resolve({
          datos: [PRODUCTO],
          meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 1, totalPaginas: 1 },
        });
      },
      obtener: () => Promise.resolve(PRODUCTO),
      eliminar: (id) => {
        espia.eliminados.push(id);
        return Promise.resolve();
      },
      ...sobrescribir,
    };

    return { repositorio, espia };
  }

  describe('ActualizarProductoCasoUso', () => {
    it('recalcula el precio de venta cuando se cambia el costo sin indicar precio', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await caso.ejecutar({ idProducto: 1, costo: 4 });

      // 4 x 1.35 = 5.40: dejar el precio anterior con un costo nuevo produciria
      // un margen inconsistente en el catalogo.
      expect(espia.actualizaciones[0]).toMatchObject({ costo: 4, precioVenta: 5.4 });
    });

    it('respeta el precio de venta cuando se indica de forma explicita', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await caso.ejecutar({ idProducto: 1, costo: 4, precioVenta: 9.99 });

      expect(espia.actualizaciones[0]).toMatchObject({ precioVenta: 9.99 });
    });

    it('no recalcula el precio si solo cambia el nombre', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await caso.ejecutar({ idProducto: 1, nombreProducto: 'Nuevo nombre' });

      expect(espia.actualizaciones[0]).toMatchObject({ precioVenta: undefined });
    });

    it('rechaza una peticion que no cambia ningun campo', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: 1 })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
      expect(espia.actualizaciones).toHaveLength(0);
    });

    it('rechaza un costo negativo', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: 1, costo: -1 })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
    });

    it('rechaza un precio de venta negativo', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ActualizarProductoCasoUso(repositorio);

      await expect(
        caso.ejecutar({ idProducto: 1, precioVenta: -1 }),
      ).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
    });
  });

  describe('ListarProductosCasoUso', () => {
    it('aplica los valores por defecto de paginacion', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarProductosCasoUso(repositorio);

      await caso.ejecutar({});

      expect(espia.listados[0]).toMatchObject({ pagina: 1, tamanoPagina: 20 });
    });

    it('recorta un tamano de pagina abusivo al maximo permitido', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarProductosCasoUso(repositorio);

      await caso.ejecutar({ tamanoPagina: 100_000 });

      // La proteccion vive en el caso de uso y no en el controlador, de modo que
      // aplica sea cual sea el transporte por el que entre la peticion.
      expect(espia.listados[0]).toMatchObject({ tamanoPagina: 200 });
    });

    it('normaliza una pagina cero o negativa a la primera', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarProductosCasoUso(repositorio);

      await caso.ejecutar({ pagina: -5 });

      expect(espia.listados[0]).toMatchObject({ pagina: 1 });
    });

    it('conserva el termino de busqueda', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new ListarProductosCasoUso(repositorio);

      await caso.ejecutar({ buscar: 'paracetamol' });

      expect(espia.listados[0]).toMatchObject({ buscar: 'paracetamol' });
    });
  });

  describe('ObtenerProductoCasoUso', () => {
    it('devuelve el producto encontrado', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ObtenerProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: 1 })).resolves.toMatchObject({
        idProducto: 1,
      });
    });

    it('lanza NO_ENCONTRADO cuando el producto no existe', async () => {
      const { repositorio } = crearRepositorio({ obtener: () => Promise.resolve(null) });
      const caso = new ObtenerProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: 999 })).rejects.toMatchObject({
        codigo: CodigoError.NO_ENCONTRADO,
      });
    });

    it('rechaza un identificador no valido antes de consultar', async () => {
      const { repositorio } = crearRepositorio();
      const caso = new ObtenerProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: 0 })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
    });
  });

  describe('EliminarProductoCasoUso', () => {
    it('delega la baja y devuelve el identificador afectado', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new EliminarProductoCasoUso(repositorio);

      const resultado = await caso.ejecutar({ idProducto: 3, usuarioApp: 'admin' });

      expect(resultado).toEqual({ idProducto: 3 });
      expect(espia.eliminados).toEqual([3]);
    });

    it('rechaza un identificador no valido sin tocar el repositorio', async () => {
      const { repositorio, espia } = crearRepositorio();
      const caso = new EliminarProductoCasoUso(repositorio);

      await expect(caso.ejecutar({ idProducto: -1 })).rejects.toMatchObject({
        codigo: CodigoError.VALIDACION,
      });
      expect(espia.eliminados).toHaveLength(0);
    });
  });
});
