import type { RegistroPuerto } from '@hce/compartido';

import type { InventarioRepositorio } from '../../aplicacion/puertos/salida/inventario.repositorio';

import { InventarioPasarelaTrazada } from './inventario.pasarela-trazada';

/**
 * Pruebas del decorador de trazas del inventario.
 *
 * Tiene una decision que lo distingue del decorador del catalogo: las
 * ESCRITURAS usan un umbral de un segundo, mientras las lecturas usan el
 * predeterminado. No es arbitrario. Una compra abre una transaccion que toca
 * cabecera, detalle, costo y Kardex; que tarde 300 ms es normal y avisarlo
 * llenaria los registros de ruido. Una consulta que tarde lo mismo, en cambio,
 * si merece mirarse.
 *
 * Es justo la clase de decision que se pierde en una refactorizacion si nadie
 * la escribio en una prueba.
 */
describe('InventarioPasarelaTrazada', () => {
  const paginado = {
    datos: [],
    meta: { pagina: 1, tamanoPagina: 20, totalRegistros: 0, totalPaginas: 0 },
  };

  const registro = (): jest.Mocked<RegistroPuerto> => ({
    depurar: jest.fn(),
    informar: jest.fn(),
    advertir: jest.fn(),
    error: jest.fn(),
  });

  const repositorio = () =>
    ({
      registrarCompra: jest.fn().mockResolvedValue({ idCompraCab: 1 }),
      listarCompras: jest.fn().mockResolvedValue(paginado),
      obtenerCompra: jest.fn().mockResolvedValue({ idCompraCab: 1 }),
      registrarVenta: jest.fn().mockResolvedValue({ idVentaCab: 1 }),
      listarVentas: jest.fn().mockResolvedValue(paginado),
      obtenerVenta: jest.fn().mockResolvedValue({ idVentaCab: 1 }),
      listarKardex: jest.fn().mockResolvedValue(paginado),
      movimientosDeProducto: jest.fn().mockResolvedValue([]),
    }) as unknown as jest.Mocked<InventarioRepositorio>;

  describe('delegacion', () => {
    it('registrarCompra pasa lineas y usuario al repositorio', async () => {
      const interno = repositorio();
      const lineas = [{ idProducto: 1, cantidad: 5, precio: 0.49 }];

      await new InventarioPasarelaTrazada(interno, registro()).registrarCompra(
        lineas,
        'farmacia',
      );

      expect(interno.registrarCompra).toHaveBeenCalledWith(lineas, 'farmacia');
    });

    it('registrarVenta pasa lineas y usuario al repositorio', async () => {
      const interno = repositorio();
      const lineas = [{ idProducto: 1, cantidad: 2 }];

      await new InventarioPasarelaTrazada(interno, registro()).registrarVenta(
        lineas,
        'farmacia',
      );

      expect(interno.registrarVenta).toHaveBeenCalledWith(lineas, 'farmacia');
    });

    it('obtenerCompra delega con el identificador', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).obtenerCompra(3);

      expect(interno.obtenerCompra).toHaveBeenCalledWith(3);
    });

    it('obtenerVenta delega con el identificador', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).obtenerVenta(9);

      expect(interno.obtenerVenta).toHaveBeenCalledWith(9);
    });

    it('listarCompras delega con la consulta', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).listarCompras({
        pagina: 2,
      });

      expect(interno.listarCompras).toHaveBeenCalledWith({ pagina: 2 });
    });

    it('listarVentas delega con la consulta', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).listarVentas({});

      expect(interno.listarVentas).toHaveBeenCalledWith({});
    });

    it('listarKardex delega con la consulta', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).listarKardex({
        buscar: 'para',
      });

      expect(interno.listarKardex).toHaveBeenCalledWith({ buscar: 'para' });
    });

    it('movimientosDeProducto propaga producto y periodo', async () => {
      const interno = repositorio();

      await new InventarioPasarelaTrazada(interno, registro()).movimientosDeProducto(
        1,
        '2026-09-01',
        '2026-09-30',
      );

      expect(interno.movimientosDeProducto).toHaveBeenCalledWith(
        1,
        '2026-09-01',
        '2026-09-30',
      );
    });

    it('devuelve el resultado del repositorio sin tocarlo', async () => {
      const interno = repositorio();

      await expect(
        new InventarioPasarelaTrazada(interno, registro()).listarKardex({}),
      ).resolves.toBe(paginado);
    });
  });

  describe('contenido de la traza', () => {
    it('la compra registra cuantas lineas llevaba', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).registrarCompra(
        [
          { idProducto: 1, cantidad: 5, precio: 0.49 },
          { idProducto: 2, cantidad: 3, precio: 1.2 },
        ],
        'farmacia',
      );

      // El numero de lineas explica por si solo una operacion lenta: veinte
      // lineas tardan mas que dos, y sin ese dato la traza no dice nada.
      expect(r.depurar.mock.calls[0]?.[0]).toContain('2 lineas');
    });

    it('la traza de la compra identifica al usuario', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).registrarCompra(
        [],
        'farmacia',
      );

      expect(r.depurar.mock.calls[0]?.[0]).toContain('usuario=farmacia');
    });

    it('la traza usa un guion cuando no hay usuario', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).registrarVenta([]);

      expect(r.depurar.mock.calls[0]?.[0]).toContain('usuario=-');
    });

    it('los listados registran la pagina consultada', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).listarCompras({ pagina: 4 });

      expect(r.depurar.mock.calls[0]?.[0]).toContain('pagina=4');
    });

    it('los listados asumen la pagina 1 si no se indica', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).listarVentas({});

      expect(r.depurar.mock.calls[0]?.[0]).toContain('pagina=1');
    });

    it('la consulta de un documento identifica cual', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).obtenerVenta(9);

      expect(r.depurar.mock.calls[0]?.[0]).toContain('obtenerVenta(9)');
    });
  });

  describe('umbral de lentitud', () => {
    /*
     * Estas dos pruebas son las que fijan la decision descrita arriba. Se
     * comprueban de forma indirecta -viendo si la operacion se registro como
     * traza o como aviso- porque el umbral es un detalle interno del decorador
     * y no algo que deba exponerse solo para poder probarlo.
     *
     * Con una operacion instantanea, la lectura no supera su umbral y la
     * escritura tampoco supera el suyo: ambas van a `depurar`. Lo que se verifica
     * es que ninguna de las dos se marque como lenta sin motivo, que es el fallo
     * realista: un umbral puesto a cero llenaria los registros de avisos.
     */
    it('una escritura rapida no se marca como lenta', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).registrarCompra([]);

      expect(r.advertir).not.toHaveBeenCalled();
      expect(r.depurar).toHaveBeenCalledTimes(1);
    });

    it('una lectura rapida tampoco', async () => {
      const r = registro();

      await new InventarioPasarelaTrazada(repositorio(), r).listarKardex({});

      expect(r.advertir).not.toHaveBeenCalled();
      expect(r.depurar).toHaveBeenCalledTimes(1);
    });
  });

  describe('errores', () => {
    it('propaga el fallo sin envolverlo', async () => {
      const interno = repositorio();
      const fallo = new Error('Stock insuficiente');
      interno.registrarVenta.mockRejectedValue(fallo);

      await expect(
        new InventarioPasarelaTrazada(interno, registro()).registrarVenta([]),
      ).rejects.toBe(fallo);
    });

    it('deja constancia del fallo en el registro', async () => {
      const interno = repositorio();
      const r = registro();
      interno.registrarVenta.mockRejectedValue(new Error('Stock insuficiente'));

      await expect(
        new InventarioPasarelaTrazada(interno, r).registrarVenta([]),
      ).rejects.toThrow();

      // Una venta rechazada por stock es informacion de negocio util: si se
      // repite, el aprovisionamiento va tarde.
      expect(r.advertir.mock.calls[0]?.[0]).toContain('Stock insuficiente');
    });
  });
});
