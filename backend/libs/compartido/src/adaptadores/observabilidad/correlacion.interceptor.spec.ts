import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';

import { obtenerCorrelacion } from './contexto-correlacion';
import { CorrelacionInterceptor } from './correlacion.interceptor';

/**
 * Pruebas del interceptor de correlacion.
 *
 * Abre el contexto de traza en el borde de cada peticion y lo cierra al
 * terminar. De ahi cuelga todo lo demas: el identificador que este interceptor
 * fija es el que acabara en las lineas de los cuatro servicios.
 *
 * Tres decisiones merecen prueba:
 *
 *   1. Que un identificador que ya viene en la cabecera se REUTILICE. Si el
 *      gateway generara uno nuevo, la traza del cliente y la del servidor no se
 *      podrian cruzar.
 *
 *   2. Que se DEVUELVA en la respuesta. Es lo que permite que un usuario que
 *      reporta un fallo cite un identificador y con el se recupere la operacion
 *      completa, en lugar de buscar por hora aproximada.
 *
 *   3. Que en RPC NO se registre una linea extra. Los decoradores de las
 *      pasarelas ya trazan cada operacion; anadir otra por mensaje duplicaria
 *      la salida sin aportar nada.
 */
describe('CorrelacionInterceptor', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const contextoHttp = (
    cabeceras: Record<string, unknown> = {},
    peticion: Record<string, unknown> = {},
  ) => {
    const setHeader = jest.fn();
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          headers: cabeceras,
          method: 'GET',
          originalUrl: '/api/productos',
          ...peticion,
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    return { host, setHeader };
  };

  const contextoRpc = (datos: unknown) =>
    ({
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => datos }),
    }) as unknown as ExecutionContext;

  const manejador = (valor: unknown = 'ok'): CallHandler => ({
    handle: () => of(valor),
  });

  describe('peticiones HTTP', () => {
    it('reutiliza el identificador que llega en la cabecera', async () => {
      const { host } = contextoHttp({ 'x-request-id': 'traza-del-cliente' });
      let visto: string | undefined;

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(host, {
          handle: () => {
            visto = obtenerCorrelacion();
            return of('ok');
          },
        }),
      );

      expect(visto).toBe('traza-del-cliente');
    });

    it('genera uno nuevo si el cliente no lo envio', async () => {
      const { host } = contextoHttp();
      let visto: string | undefined;

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(host, {
          handle: () => {
            visto = obtenerCorrelacion();
            return of('ok');
          },
        }),
      );

      expect(visto).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.each([
      ['viene vacia', ''],
      ['no es una cadena', 42],
    ])('genera uno nuevo si la cabecera %s', async (_caso, valor) => {
      const { host } = contextoHttp({ 'x-request-id': valor });
      let visto: string | undefined;

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(host, {
          handle: () => {
            visto = obtenerCorrelacion();
            return of('ok');
          },
        }),
      );

      expect(visto).toMatch(/^[0-9a-f-]{36}$/);
    });

    /*
     * Devolverlo en la respuesta es lo que convierte la traza en algo que el
     * usuario puede citar. Sin esto, para investigar un fallo habria que buscar
     * por hora aproximada entre los registros de cuatro servicios.
     */
    it('devuelve el identificador al cliente en la respuesta', async () => {
      const { host, setHeader } = contextoHttp({ 'x-request-id': 'traza-123' });

      await firstValueFrom(new CorrelacionInterceptor().intercept(host, manejador()));

      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'traza-123');
    });

    it('registra la peticion con su identificador y duracion', async () => {
      const registrar = jest.spyOn(Logger.prototype, 'log');
      registrar.mockClear();
      const { host } = contextoHttp({ 'x-request-id': 'traza-123' });

      await firstValueFrom(new CorrelacionInterceptor().intercept(host, manejador()));

      const linea = String(registrar.mock.calls[0]?.[0]);
      expect(linea).toContain('traza-123');
      expect(linea).toContain('GET /api/productos');
      expect(linea).toMatch(/\d{1,10} ms/);
    });

    it('usa la url simple cuando no hay originalUrl', async () => {
      const registrar = jest.spyOn(Logger.prototype, 'log');
      registrar.mockClear();
      const { host } = contextoHttp({}, { originalUrl: undefined, url: '/api/ventas' });

      await firstValueFrom(new CorrelacionInterceptor().intercept(host, manejador()));

      expect(String(registrar.mock.calls[0]?.[0])).toContain('/api/ventas');
    });

    /*
     * Una peticion sin metodo ni ruta reconocibles no debe dejar la linea del
     * registro a medias. Puede pasar con transportes que no son Express o con
     * peticiones malformadas: se registra con interrogantes en lugar de con
     * `undefined`, que es lo que rompe las busquedas despues.
     */
    it('describe la peticion con interrogantes si no trae metodo ni ruta', async () => {
      const registrar = jest.spyOn(Logger.prototype, 'log');
      registrar.mockClear();
      const { host } = contextoHttp(
        {},
        { method: undefined, originalUrl: undefined, url: undefined },
      );

      await firstValueFrom(new CorrelacionInterceptor().intercept(host, manejador()));

      expect(String(registrar.mock.calls[0]?.[0])).toContain('? ?');
    });

    it('la peticion que falla tambien se registra, como aviso', async () => {
      const avisar = jest.spyOn(Logger.prototype, 'warn');
      avisar.mockClear();
      const { host } = contextoHttp({ 'x-request-id': 'traza-123' });

      await expect(
        firstValueFrom(
          new CorrelacionInterceptor().intercept(host, {
            handle: () => throwError(() => new Error('stock insuficiente')),
          }),
        ),
      ).rejects.toThrow();

      // Una peticion que falla es justo la que se va a investigar: perder su
      // linea seria perder el caso que mas interesa.
      const linea = String(avisar.mock.calls[0]?.[0]);
      expect(linea).toContain('traza-123');
      expect(linea).toContain('stock insuficiente');
    });

    it('un fallo que no es un Error se registra igualmente', async () => {
      const avisar = jest.spyOn(Logger.prototype, 'warn');
      avisar.mockClear();
      const { host } = contextoHttp({ 'x-request-id': 'traza-123' });

      await expect(
        firstValueFrom(
          new CorrelacionInterceptor().intercept(host, {
            // Codigo de terceros que rechaza con una cadena: la linea del
            // registro no debe quedarse en "[object Object]".
            handle: () => throwError(() => 'cadena suelta'),
          }),
        ),
      ).rejects.toBe('cadena suelta');

      expect(String(avisar.mock.calls[0]?.[0])).toContain('error');
    });

    it('el fallo se propaga sin envolver', async () => {
      const { host } = contextoHttp();
      const fallo = new Error('roto');

      await expect(
        firstValueFrom(
          new CorrelacionInterceptor().intercept(host, {
            handle: () => throwError(() => fallo),
          }),
        ),
      ).rejects.toBe(fallo);
    });

    it('no rompe si la respuesta no admite cabeceras', async () => {
      const host = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ headers: {}, method: 'GET', url: '/x' }),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;

      // Puede ocurrir con transportes que no son Express. Es preferible perder
      // la cabecera a tirar la peticion por un detalle de observabilidad.
      await expect(
        firstValueFrom(new CorrelacionInterceptor().intercept(host, manejador())),
      ).resolves.toBe('ok');
    });
  });

  describe('mensajes RPC', () => {
    it('toma el identificador que viaja dentro del mensaje', async () => {
      let visto: string | undefined;

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(
          contextoRpc({ correlacion: 'traza-123' }),
          {
            handle: () => {
              visto = obtenerCorrelacion();
              return of('ok');
            },
          },
        ),
      );

      // Asi se cose la traza del gateway con la del microservicio.
      expect(visto).toBe('traza-123');
    });

    it('genera uno nuevo si el mensaje no lo trae', async () => {
      let visto: string | undefined;

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(contextoRpc({ idProducto: 1 }), {
          handle: () => {
            visto = obtenerCorrelacion();
            return of('ok');
          },
        }),
      );

      expect(visto).toMatch(/^[0-9a-f-]{36}$/);
    });

    /*
     * En RPC no se registra nada aqui a proposito. Los decoradores de las
     * pasarelas ya trazan cada acceso a datos con su duracion; una linea mas por
     * mensaje solo duplicaria la salida.
     */
    it('no anade una linea de registro: ya la ponen las pasarelas', async () => {
      const registrar = jest.spyOn(Logger.prototype, 'log');
      registrar.mockClear();

      await firstValueFrom(
        new CorrelacionInterceptor().intercept(
          contextoRpc({ correlacion: 'traza-123' }),
          manejador(),
        ),
      );

      expect(registrar).not.toHaveBeenCalled();
    });

    it('devuelve el resultado del manejador sin tocarlo', async () => {
      const resultado = { idProducto: 1 };

      await expect(
        firstValueFrom(
          new CorrelacionInterceptor().intercept(contextoRpc({}), manejador(resultado)),
        ),
      ).resolves.toBe(resultado);
    });
  });
});
