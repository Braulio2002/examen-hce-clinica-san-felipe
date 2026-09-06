import {
  ErrorInfraestructura,
  ErrorNoEncontrado,
  type RegistroPuerto,
  type ResultadoPaginado,
} from '@hce/compartido';

import type {
  ActualizarProductoPeticion,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../aplicacion/modelos/producto.modelos';
import type { ProductoRepositorio } from '../../aplicacion/puertos/salida/producto.repositorio';

import {
  ProductoPasarelaConReintentos,
  ProductoPasarelaTrazada,
} from './producto.pasarela-decoradores';

/**
 * Pruebas de los decoradores de la pasarela de catalogo.
 *
 * Aqui esta el patron Decorator de la GoF: dos clases que envuelven al
 * repositorio real y le anaden comportamiento sin que este sepa nada.
 *
 * Lo que se comprueba es lo que define al patron y lo que puede romperse:
 *
 *   - Que el decorador NO altere el resultado. Un decorador que transforma lo
 *     que envuelve deja de ser transparente y se convierte en logica escondida.
 *   - Que delegue con los mismos argumentos, incluidos los opcionales.
 *   - Que el reintento distinga un fallo transitorio de uno de negocio. Es la
 *     parte con criterio: reintentar un "producto no encontrado" es inutil, y
 *     reintentar una escritura seria peligroso.
 */
describe('Decoradores de la pasarela de catalogo', () => {
  const PRODUCTO: ProductoRespuesta = {
    idProducto: 1,
    nombreProducto: 'Paracetamol 500 mg',
    nroLote: 'LT-2026-0001',
    fechaRegistro: new Date('2026-09-01T08:00:00Z'),
    costo: 0.49,
    precioVenta: 0.6615,
    stockActual: 680,
  };

  const PAGINA: ResultadoPaginado<ProductoRespuesta> = {
    datos: [PRODUCTO],
    meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 1, totalPaginas: 1 },
  };

  const ALTA: RegistrarProductoPeticion = {
    nombreProducto: 'Amoxicilina 500 mg',
    nroLote: 'LT-3',
    costo: 1.15,
  };

  const CAMBIO: ActualizarProductoPeticion = { idProducto: 1, costo: 2 };

  const registro = (): jest.Mocked<RegistroPuerto> => ({
    depurar: jest.fn(),
    informar: jest.fn(),
    advertir: jest.fn(),
    error: jest.fn(),
  });

  const repositorio = (): jest.Mocked<ProductoRepositorio> => ({
    registrar: jest.fn().mockResolvedValue(PRODUCTO),
    actualizar: jest.fn().mockResolvedValue(PRODUCTO),
    listar: jest.fn().mockResolvedValue(PAGINA),
    obtener: jest.fn().mockResolvedValue(PRODUCTO),
    eliminar: jest.fn().mockResolvedValue(undefined),
  });

  describe('ProductoPasarelaTrazada', () => {
    it('devuelve el resultado del repositorio sin tocarlo', async () => {
      const interno = repositorio();

      const resultado = await new ProductoPasarelaTrazada(interno, registro()).obtener(1);

      // `toBe` y no `toEqual`: debe ser el MISMO objeto, sin copias ni cambios.
      expect(resultado).toBe(PRODUCTO);
    });

    it('registra la operacion con su nombre', async () => {
      const r = registro();

      await new ProductoPasarelaTrazada(repositorio(), r).obtener(7);

      expect(r.depurar).toHaveBeenCalledTimes(1);
      expect(r.depurar.mock.calls[0]?.[0]).toContain('obtener(7)');
    });

    it('el nombre de la traza identifica el producto afectado', async () => {
      const r = registro();

      await new ProductoPasarelaTrazada(repositorio(), r).registrar(ALTA);

      // Sin el nombre en la traza, un registro lento no dice que se estaba
      // haciendo y hay que cruzarlo a mano con la peticion.
      expect(r.depurar.mock.calls[0]?.[0]).toContain('Amoxicilina 500 mg');
    });

    it('la traza del listado incluye pagina y busqueda', async () => {
      const r = registro();

      await new ProductoPasarelaTrazada(repositorio(), r).listar({
        pagina: 3,
        buscar: 'para',
      });

      const mensaje = r.depurar.mock.calls[0]?.[0] ?? '';
      expect(mensaje).toContain('pagina=3');
      expect(mensaje).toContain('buscar=para');
    });

    it('la traza del listado usa valores por defecto legibles si no se filtro', async () => {
      const r = registro();

      await new ProductoPasarelaTrazada(repositorio(), r).listar({});

      expect(r.depurar.mock.calls[0]?.[0]).toContain('pagina=1, buscar=-');
    });

    it('registrar delega en el repositorio envuelto', async () => {
      const interno = repositorio();

      await new ProductoPasarelaTrazada(interno, registro()).registrar(ALTA);

      expect(interno.registrar).toHaveBeenCalledWith(ALTA);
    });

    it('actualizar delega en el repositorio envuelto', async () => {
      const interno = repositorio();

      await new ProductoPasarelaTrazada(interno, registro()).actualizar(CAMBIO);

      expect(interno.actualizar).toHaveBeenCalledWith(CAMBIO);
    });

    it('propaga el usuario en la baja, incluido cuando no se indica', async () => {
      const interno = repositorio();

      await new ProductoPasarelaTrazada(interno, registro()).eliminar(3);

      expect(interno.eliminar).toHaveBeenCalledWith(3, undefined);
    });

    it('propaga el usuario en la baja cuando si se indica', async () => {
      const interno = repositorio();

      await new ProductoPasarelaTrazada(interno, registro()).eliminar(3, 'admin');

      expect(interno.eliminar).toHaveBeenCalledWith(3, 'admin');
    });

    it('deja pasar el error sin envolverlo', async () => {
      const interno = repositorio();
      const fallo = new ErrorNoEncontrado('Producto', 9);
      interno.obtener.mockRejectedValue(fallo);

      await expect(
        new ProductoPasarelaTrazada(interno, registro()).obtener(9),
      ).rejects.toBe(fallo);
    });
  });

  describe('ProductoPasarelaConReintentos', () => {
    // Espera base de 0 ms: la prueba no debe tardar 900 ms en comprobar tres
    // intentos. El comportamiento que interesa es cuantos, no cuanto se espera.
    const conReintentos = (interno: ProductoRepositorio, r: RegistroPuerto) =>
      new ProductoPasarelaConReintentos(interno, r, 3, 0);

    describe('lecturas', () => {
      it('no reintenta cuando la primera llamada funciona', async () => {
        const interno = repositorio();

        await conReintentos(interno, registro()).obtener(1);

        expect(interno.obtener).toHaveBeenCalledTimes(1);
      });

      it('reintenta ante un fallo de infraestructura y acaba devolviendo el dato', async () => {
        const interno = repositorio();
        interno.obtener
          .mockRejectedValueOnce(new ErrorInfraestructura('conexion caida'))
          .mockResolvedValueOnce(PRODUCTO);

        await expect(conReintentos(interno, registro()).obtener(1)).resolves.toBe(
          PRODUCTO,
        );
        expect(interno.obtener).toHaveBeenCalledTimes(2);
      });

      it('se rinde tras agotar los intentos y propaga el ultimo error', async () => {
        const interno = repositorio();
        const fallo = new ErrorInfraestructura('la base no responde');
        interno.obtener.mockRejectedValue(fallo);

        await expect(conReintentos(interno, registro()).obtener(1)).rejects.toBe(fallo);
        expect(interno.obtener).toHaveBeenCalledTimes(3);
      });

      /*
       * Esta es la prueba con mas criterio del archivo.
       *
       * Un "producto no encontrado" no es un fallo transitorio: por muchas veces
       * que se repita la consulta, el producto va a seguir sin existir.
       * Reintentarlo triplica la carga y triplica la latencia que ve el usuario,
       * a cambio de nada.
       */
      it('NO reintenta un error de negocio: reintentarlo no cambiaria nada', async () => {
        const interno = repositorio();
        interno.obtener.mockRejectedValue(new ErrorNoEncontrado('Producto', 99));

        await expect(conReintentos(interno, registro()).obtener(99)).rejects.toThrow();
        expect(interno.obtener).toHaveBeenCalledTimes(1);
      });

      it('el listado tambien se reintenta', async () => {
        const interno = repositorio();
        interno.listar
          .mockRejectedValueOnce(new ErrorInfraestructura('timeout'))
          .mockResolvedValueOnce(PAGINA);

        await expect(conReintentos(interno, registro()).listar({})).resolves.toBe(PAGINA);
        expect(interno.listar).toHaveBeenCalledTimes(2);
      });

      it('avisa en el registro de cada reintento', async () => {
        const interno = repositorio();
        const r = registro();
        interno.listar
          .mockRejectedValueOnce(new ErrorInfraestructura('timeout'))
          .mockResolvedValueOnce(PAGINA);

        await conReintentos(interno, r).listar({});

        expect(r.advertir).toHaveBeenCalledTimes(1);
        expect(r.advertir.mock.calls[0]?.[0]).toMatch(/intento 1\/3/i);
      });
    });

    describe('escrituras', () => {
      /*
       * Las escrituras NO se reintentan, y es deliberado. Si una compra fallo
       * despues de haber comprometido la transaccion pero antes de responder,
       * repetirla registraria el documento dos veces. Ante la duda, es preferible
       * fallar y que el usuario reintente conscientemente.
       */
      it('registrar no se reintenta: duplicaria el alta', async () => {
        const interno = repositorio();
        interno.registrar.mockRejectedValue(new ErrorInfraestructura('conexion caida'));

        await expect(
          conReintentos(interno, registro()).registrar(ALTA),
        ).rejects.toThrow();
        expect(interno.registrar).toHaveBeenCalledTimes(1);
      });

      it('actualizar no se reintenta', async () => {
        const interno = repositorio();
        interno.actualizar.mockRejectedValue(new ErrorInfraestructura('conexion caida'));

        await expect(
          conReintentos(interno, registro()).actualizar(CAMBIO),
        ).rejects.toThrow();
        expect(interno.actualizar).toHaveBeenCalledTimes(1);
      });

      it('eliminar no se reintenta y conserva el usuario', async () => {
        const interno = repositorio();
        interno.eliminar.mockRejectedValue(new ErrorInfraestructura('conexion caida'));

        await expect(
          conReintentos(interno, registro()).eliminar(1, 'admin'),
        ).rejects.toThrow();
        expect(interno.eliminar).toHaveBeenCalledTimes(1);
        expect(interno.eliminar).toHaveBeenCalledWith(1, 'admin');
      });
    });
  });
});
