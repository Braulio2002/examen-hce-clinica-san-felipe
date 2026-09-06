import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  CodigoError,
  type ErrorSerializado,
  ErrorNoEncontrado,
  ErrorStockInsuficiente,
} from '../../dominio/excepciones/dominio.excepcion';

import { ExcepcionRpcFiltro } from './excepcion-rpc.filtro';

/**
 * Pruebas del filtro de excepciones de los microservicios.
 *
 * Es el espejo del filtro HTTP, al otro lado del transporte. Su trabajo es
 * SERIALIZAR el error de dominio para que sobreviva al viaje por TCP, donde una
 * excepcion pierde su clase y se convierte en un objeto plano.
 *
 * Si no serializara el codigo, el gateway recibiria un objeto irreconocible y
 * lo traduciria a 500. Una venta rechazada por falta de stock -que es un caso
 * de negocio perfectamente normal- se veria en pantalla como un fallo del
 * sistema. Ese par de filtros es lo que mantiene la semantica del error a lo
 * largo de toda la cadena.
 */
describe('ExcepcionRpcFiltro', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const host = {} as ArgumentsHost;

  /** Ejecuta el filtro y devuelve el payload con el que rechaza. */
  const capturar = async (excepcion: unknown): Promise<ErrorSerializado> => {
    try {
      await firstValueFrom(new ExcepcionRpcFiltro().catch(excepcion, host));
      throw new Error('Se esperaba que el filtro rechazara.');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      return (error as RpcException).getError() as ErrorSerializado;
    }
  };

  describe('errores de dominio', () => {
    it('serializa el codigo para que sobreviva al transporte', async () => {
      const payload = await capturar(new ErrorNoEncontrado('Producto', 99));

      // Sin el codigo, al otro lado esto seria un 500 en vez de un 404.
      expect(payload.codigo).toBe(CodigoError.NO_ENCONTRADO);
    });

    it('conserva el mensaje de negocio', async () => {
      const payload = await capturar(
        new ErrorStockInsuficiente('Solo quedan 2 unidades de Paracetamol'),
      );

      expect(payload.mensaje).toContain('Solo quedan 2 unidades');
    });

    it('el stock insuficiente conserva su codigo propio', async () => {
      const payload = await capturar(new ErrorStockInsuficiente('sin stock'));

      expect(payload.codigo).toBe(CodigoError.STOCK_INSUFICIENTE);
    });
  });

  describe('excepciones RPC ya construidas', () => {
    it('reconstruye la que envuelve un error de dominio', async () => {
      const payload = await capturar(
        new RpcException({
          codigo: CodigoError.CONFLICTO,
          mensaje: 'Ya existe ese lote',
        }),
      );

      expect(payload).toMatchObject({
        codigo: CodigoError.CONFLICTO,
        mensaje: 'Ya existe ese lote',
      });
    });

    it('la que lleva solo texto se trata como infraestructura', async () => {
      const payload = await capturar(new RpcException('algo se rompio'));

      expect(payload.codigo).toBe(CodigoError.INFRAESTRUCTURA);
      expect(payload.mensaje).toBe('algo se rompio');
    });

    it('la que lleva un objeto irreconocible tambien', async () => {
      const payload = await capturar(new RpcException({ raro: true }));

      expect(payload).toEqual({
        codigo: CodigoError.INFRAESTRUCTURA,
        mensaje: 'Error en el microservicio.',
      });
    });
  });

  describe('errores de programacion', () => {
    /*
     * TypeError y RangeError casi siempre vienen de un dato que no cumplia lo
     * esperado -una cantidad fuera de rango, un campo ausente-, asi que se
     * traducen a validacion y acaban en un 400 en lugar de un 500. Es mas
     * exacto: el problema esta en la peticion, no en el servidor.
     */
    it.each([
      ['RangeError', new RangeError('La cantidad debe estar entre 1 y 9999')],
      ['TypeError', new TypeError('Se esperaba un numero')],
    ])('%s se trata como error de validacion', async (_caso, excepcion) => {
      const payload = await capturar(excepcion);

      expect(payload.codigo).toBe(CodigoError.VALIDACION);
      expect(payload.mensaje).toBe(excepcion.message);
    });

    /*
     * Lo demas es un fallo inesperado. Se registra entero por dentro y por fuera
     * viaja un mensaje generico: el gateway lo convertira en 500 sin exponer
     * detalles internos al cliente.
     */
    it.each([
      ['un Error generico', new Error('fallo la conexion a 10.0.0.5')],
      ['una cadena', 'algo raro'],
      ['null', null],
      ['undefined', undefined],
    ])('%s se convierte en un error interno generico', async (_caso, excepcion) => {
      const payload = await capturar(excepcion);

      expect(payload).toEqual({
        codigo: CodigoError.INFRAESTRUCTURA,
        mensaje: 'Error interno del microservicio.',
      });
    });

    it('el mensaje original del fallo no cruza el transporte', async () => {
      const payload = await capturar(new Error('fallo la conexion a 10.0.0.5'));

      expect(payload.mensaje).not.toContain('10.0.0.5');
    });
  });

  describe('registro', () => {
    /*
     * Un fallo de infraestructura se registra como error y con la traza; un
     * error de negocio, como aviso y sin ella. Distinguirlos es lo que hace que
     * los registros sirvan para algo: si toda venta sin stock apareciera como
     * error, el nivel dejaria de significar nada.
     */
    it('el fallo de infraestructura se registra como error, con traza', async () => {
      const espia = jest.spyOn(Logger.prototype, 'error');
      espia.mockClear();

      await capturar(new Error('roto'));

      expect(espia).toHaveBeenCalledTimes(1);
      expect(espia.mock.calls[0]?.[1]).toContain('excepcion-rpc.filtro.spec');
    });

    it('el error de negocio se registra como aviso', async () => {
      const avisar = jest.spyOn(Logger.prototype, 'warn');
      const fallar = jest.spyOn(Logger.prototype, 'error');
      avisar.mockClear();
      fallar.mockClear();

      await capturar(new ErrorNoEncontrado('Producto', 1));

      expect(avisar).toHaveBeenCalledTimes(1);
      expect(fallar).not.toHaveBeenCalled();
    });
  });
});
