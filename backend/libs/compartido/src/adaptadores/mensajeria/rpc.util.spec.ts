import { RequestTimeoutException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import {
  CodigoError,
  ExcepcionDominio,
} from '../../dominio/excepciones/dominio.excepcion';
import { ejecutarConCorrelacion } from '../observabilidad/contexto-correlacion';

import { enviarMensaje } from './rpc.util';

/**
 * Pruebas del envio de mensajes RPC.
 *
 * Esta funcion es el unico punto por el que el gateway habla con los
 * microservicios, y concentra tres decisiones que valen mas que su tamano:
 *
 *   1. El TIMEOUT. Sin el, un microservicio colgado bloquea conexiones del
 *      gateway hasta agotarlas, y una caida parcial se convierte en una caida
 *      total. Es el patron de la mampara: contener el fallo donde se produce.
 *
 *   2. La RECONSTRUCCION del error de dominio. Al cruzar TCP, una excepcion se
 *      serializa y deja de ser una instancia. Si no se reconstruye, un "stock
 *      insuficiente" -que es un 422 legitimo- llega al cliente como un 500.
 *      Es la diferencia entre "no hay unidades" y "la aplicacion se rompio".
 *
 *   3. La propagacion del identificador de correlacion dentro del mensaje,
 *      porque el transporte TCP no tiene cabeceras donde ponerlo.
 */
describe('enviarMensaje', () => {
  const clienteQueDevuelve = (valor: unknown) => {
    const send = jest.fn().mockReturnValue(of(valor));
    return { doble: { send } as unknown as ClientProxy, send };
  };

  const clienteQueFalla = (error: unknown) => {
    const send = jest.fn().mockReturnValue(throwError(() => error));
    return { doble: { send } as unknown as ClientProxy, send };
  };

  describe('camino normal', () => {
    it('devuelve la respuesta del microservicio', async () => {
      const { doble } = clienteQueDevuelve({ idProducto: 1 });

      await expect(enviarMensaje(doble, 'producto.obtener', { id: 1 })).resolves.toEqual({
        idProducto: 1,
      });
    });

    it('envia el patron y el mensaje al cliente', async () => {
      const { doble, send } = clienteQueDevuelve('ok');

      await enviarMensaje(doble, 'producto.listar', { pagina: 1 });

      expect(send.mock.calls[0]?.[0]).toBe('producto.listar');
      expect(send.mock.calls[0]?.[1]).toMatchObject({ pagina: 1 });
    });
  });

  describe('correlacion', () => {
    it('adjunta el identificador activo al mensaje', async () => {
      const { doble, send } = clienteQueDevuelve('ok');

      await ejecutarConCorrelacion('abc-123', () =>
        enviarMensaje(doble, 'producto.listar', { pagina: 1 }),
      );

      // El transporte TCP no tiene cabeceras: el identificador viaja dentro.
      expect(send.mock.calls[0]?.[1]).toEqual({ pagina: 1, correlacion: 'abc-123' });
    });

    it('envia el mensaje sin tocar si no hay contexto activo', async () => {
      const { doble, send } = clienteQueDevuelve('ok');

      await enviarMensaje(doble, 'producto.listar', { pagina: 1 });

      expect(send.mock.calls[0]?.[1]).toEqual({ pagina: 1 });
    });
  });

  describe('timeout', () => {
    /*
     * Un microservicio que no responde no puede dejar colgada la peticion del
     * usuario indefinidamente. Se corta y se devuelve 408, que es sincero: no
     * sabemos si la operacion se hizo, solo que no contesto a tiempo.
     */
    it('corta la espera cuando el servicio no responde', async () => {
      const send = jest
        .fn()
        .mockReturnValue(timer(5000).pipe(mergeMap(() => of('tarde'))));
      const doble = { send } as unknown as ClientProxy;

      // 20 ms de limite: la prueba no debe esperar los 10 s de produccion.
      await expect(
        enviarMensaje(doble, 'producto.listar', {}, 20),
      ).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it('el mensaje del timeout dice cuanto se espero y en que patron', async () => {
      const send = jest
        .fn()
        .mockReturnValue(timer(5000).pipe(mergeMap(() => of('tarde'))));
      const doble = { send } as unknown as ClientProxy;

      await expect(enviarMensaje(doble, 'compra.registrar', {}, 20)).rejects.toThrow(
        /20 ms.*compra\.registrar/,
      );
    });
  });

  describe('errores de dominio que cruzan el transporte', () => {
    /*
     * Al serializarse, la excepcion pierde su clase y llega como objeto plano.
     * Estas pruebas cubren las tres formas en que NestJS puede entregarla, que
     * dependen de como se lanzo en el otro extremo. Las tres deben acabar en la
     * misma excepcion de dominio reconstruida.
     */
    it.each([
      [
        'plano',
        { codigo: CodigoError.STOCK_INSUFICIENTE, mensaje: 'Stock insuficiente' },
      ],
      [
        'dentro de la propiedad error',
        {
          error: {
            codigo: CodigoError.STOCK_INSUFICIENTE,
            mensaje: 'Stock insuficiente',
          },
        },
      ],
      [
        'dentro de la propiedad message',
        {
          message: {
            codigo: CodigoError.STOCK_INSUFICIENTE,
            mensaje: 'Stock insuficiente',
          },
        },
      ],
    ])('reconstruye la excepcion de dominio entregada %s', async (_forma, error) => {
      const { doble } = clienteQueFalla(error);

      await expect(enviarMensaje(doble, 'venta.registrar', {})).rejects.toBeInstanceOf(
        ExcepcionDominio,
      );
    });

    it('conserva el codigo y el mensaje originales', async () => {
      const { doble } = clienteQueFalla({
        codigo: CodigoError.STOCK_INSUFICIENTE,
        mensaje: 'Stock insuficiente para el producto 1.',
      });

      // El codigo es lo que el filtro traduce a 422 en lugar de 500. Perderlo
      // convertiria un aviso de negocio en un error del servidor.
      await expect(enviarMensaje(doble, 'venta.registrar', {})).rejects.toMatchObject({
        codigo: CodigoError.STOCK_INSUFICIENTE,
        message: 'Stock insuficiente para el producto 1.',
      });
    });
  });

  describe('fallos de comunicacion', () => {
    it.each([
      ['el servicio esta caido', new Error('ECONNREFUSED')],
      ['llega un error sin forma reconocible', { algo: 'raro' }],
      ['llega una cadena suelta', 'fallo'],
    ])('devuelve error de infraestructura cuando %s', async (_caso, error) => {
      const { doble } = clienteQueFalla(error);

      await expect(enviarMensaje(doble, 'producto.listar', {})).rejects.toMatchObject({
        codigo: CodigoError.INFRAESTRUCTURA,
      });
    });

    it('el mensaje identifica el patron que fallo', async () => {
      const { doble } = clienteQueFalla(new Error('ECONNREFUSED'));

      // Con cuatro servicios, saber cual no respondio ahorra el primer cuarto
      // de hora de cualquier investigacion.
      await expect(enviarMensaje(doble, 'kardex.listar', {})).rejects.toThrow(
        /kardex\.listar/,
      );
    });
  });
});
