import type {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  crearCliente,
  ErrorApi,
  establecerToken,
  obtenerToken,
  registrarManejadorExpiracion,
} from './cliente';

/**
 * Pruebas del cliente HTTP.
 *
 * Es la unica puerta por la que el FrontEnd habla con la API, y concentra tres
 * decisiones que se toman una vez y afectan a todas las pantallas:
 *
 *   1. `withCredentials`. Sin el, el navegador NO envia la cookie HttpOnly y
 *      toda peticion autenticada responde 401. Es un flag de una linea del que
 *      depende que la sesion funcione.
 *
 *   2. La TRADUCCION del error. Axios lanza objetos con la respuesta anidada;
 *      las pantallas reciben un `ErrorApi` con mensaje ya presentable. Sin esta
 *      capa, cada componente tendria que hurgar en `error.response.data` y
 *      redactar su propio texto, y los mensajes acabarian siendo distintos en
 *      cada pantalla.
 *
 *   3. La reaccion al 401. Se limpia el token y se avisa a la aplicacion desde
 *      un unico punto. Repartir eso por las pantallas garantiza que alguna se
 *      olvide y deje al usuario en una pagina que ya no puede cargar nada.
 *
 * Los interceptores se prueban invocandolos directamente en lugar de a traves
 * de una peticion real: son funciones puras sobre la configuracion y el error, y
 * asi la prueba no necesita ni servidor ni simulacion de red.
 */
describe('Cliente HTTP', () => {
  const BASE = 'http://localhost:4000/api';

  type ManejadorPeticion = (
    config: InternalAxiosRequestConfig,
  ) => InternalAxiosRequestConfig;
  type ManejadorRechazo = (error: unknown) => Promise<never>;
  type ManejadorRespuesta = (error: AxiosError) => Promise<never>;

  /**
   * Extrae los manejadores que el cliente registro en axios. Es la unica forma
   * de ejercitarlos sin levantar un servidor.
   */
  const interceptores = (cliente: AxiosInstance) => {
    const peticion = (
      cliente.interceptors.request as unknown as {
        handlers: { fulfilled: ManejadorPeticion; rejected: ManejadorRechazo }[];
      }
    ).handlers[0];

    const respuesta = (
      cliente.interceptors.response as unknown as {
        handlers: {
          fulfilled: (r: AxiosResponse) => AxiosResponse;
          rejected: ManejadorRespuesta;
        }[];
      }
    ).handlers[0];

    // Si el cliente dejara de registrar sus interceptores, la prueba fallaria
    // aqui con un motivo claro en lugar de mas abajo con "no se puede leer
    // 'fulfilled' de undefined", que no dice nada de la causa.
    if (!peticion || !respuesta) {
      throw new Error('El cliente no registro sus interceptores.');
    }

    return { peticion, respuesta };
  };

  const configuracionVacia = (): InternalAxiosRequestConfig => {
    const cabeceras = new Map<string, string>();
    return {
      headers: {
        set: (clave: string, valor: string) => cabeceras.set(clave, valor),
        obtener: (clave: string) => cabeceras.get(clave),
      },
    } as unknown as InternalAxiosRequestConfig;
  };

  const leerCabecera = (config: InternalAxiosRequestConfig, clave: string): unknown =>
    (config.headers as unknown as { obtener: (c: string) => unknown }).obtener(clave);

  /** Fabrica un error de axios con la respuesta indicada. */
  const errorConRespuesta = (status: number, data?: unknown): AxiosError =>
    ({ response: { status, data }, isAxiosError: true }) as AxiosError;

  beforeEach(() => {
    establecerToken(null);
    registrarManejadorExpiracion(() => undefined);
  });

  describe('configuracion', () => {
    it('usa la URL base indicada', () => {
      expect(crearCliente(BASE).defaults.baseURL).toBe(BASE);
    });

    /*
     * Sin `withCredentials` el navegador no adjunta la cookie HttpOnly que
     * lleva el JWT, y toda peticion autenticada responde 401. Es la unica
     * opcion de esta configuracion de la que depende que la sesion exista.
     */
    it('envia las credenciales: es lo que hace viajar la cookie de sesion', () => {
      expect(crearCliente(BASE).defaults.withCredentials).toBe(true);
    });

    it('corta la espera para que la interfaz no se quede colgada', () => {
      const timeout = crearCliente(BASE).defaults.timeout;

      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(30_000);
    });
  });

  describe('token en memoria', () => {
    /*
     * El token se guarda en memoria y no en localStorage. Es deliberado: lo que
     * hay en localStorage lo puede leer cualquier script inyectado en la pagina.
     * El mecanismo principal es la cookie HttpOnly; esto es el respaldo para
     * clientes que no usan cookies.
     */
    it('se guarda y se recupera', () => {
      establecerToken('token-123');

      expect(obtenerToken()).toBe('token-123');
    });

    it('se puede limpiar', () => {
      establecerToken('token-123');
      establecerToken(null);

      expect(obtenerToken()).toBeNull();
    });
  });

  describe('interceptor de peticion', () => {
    it('adjunta el token cuando lo hay', () => {
      const cliente = crearCliente(BASE);
      establecerToken('token-123');

      const config = interceptores(cliente).peticion.fulfilled(configuracionVacia());

      expect(leerCabecera(config, 'Authorization')).toBe('Bearer token-123');
    });

    it('no adjunta cabecera de autorizacion si no hay token', () => {
      const cliente = crearCliente(BASE);

      const config = interceptores(cliente).peticion.fulfilled(configuracionVacia());

      expect(leerCabecera(config, 'Authorization')).toBeUndefined();
    });

    it('marca la peticion como asincrona', () => {
      const cliente = crearCliente(BASE);

      const config = interceptores(cliente).peticion.fulfilled(configuracionVacia());

      // Permite al servidor distinguir una llamada de la aplicacion de una
      // navegacion del navegador.
      expect(leerCabecera(config, 'X-Requested-With')).toBe('XMLHttpRequest');
    });

    it('un fallo antes de enviar se rechaza siempre como Error', async () => {
      const cliente = crearCliente(BASE);

      // Quien capture puede leer `message` y `stack` sin comprobar la forma.
      await expect(
        interceptores(cliente).peticion.rejected('cadena suelta'),
      ).rejects.toBeInstanceOf(Error);
    });

    it('conserva el Error original si ya lo era', async () => {
      const cliente = crearCliente(BASE);
      const fallo = new Error('ya era un Error');

      await expect(interceptores(cliente).peticion.rejected(fallo)).rejects.toBe(fallo);
    });
  });

  describe('interceptor de respuesta: camino correcto', () => {
    /*
     * Una respuesta correcta pasa TAL CUAL. Es lo que se espera de un
     * interceptor de errores, y conviene fijarlo: si algun dia se le anadiera
     * una transformacion aqui, afectaria a todas las pantallas a la vez y seria
     * dificil de atribuir.
     */
    it('deja pasar la respuesta sin tocarla', () => {
      const cliente = crearCliente(BASE);
      const original = { data: { idProducto: 1 }, status: 200 } as AxiosResponse;

      expect(interceptores(cliente).respuesta.fulfilled(original)).toBe(original);
    });
  });

  describe('interceptor de respuesta: sin conexion', () => {
    it('distingue un tiempo agotado de un servidor inalcanzable', async () => {
      const cliente = crearCliente(BASE);
      const error = { code: 'ECONNABORTED' } as AxiosError;

      const fallo = await interceptores(cliente)
        .respuesta.rejected(error)
        .catch((e: unknown) => e as ErrorApi);

      // Son dos situaciones distintas para el usuario: una invita a reintentar,
      // la otra a revisar su conexion.
      expect(fallo.codigo).toBe('TIMEOUT');
      expect(fallo.mensaje).toMatch(/tardo demasiado/i);
    });

    it('avisa de la falta de conexion cuando no hubo respuesta', async () => {
      const cliente = crearCliente(BASE);

      const fallo = await interceptores(cliente)
        .respuesta.rejected({} as AxiosError)
        .catch((e: unknown) => e as ErrorApi);

      expect(fallo.codigo).toBe('SIN_CONEXION');
      expect(fallo.status).toBe(0);
    });
  });

  describe('interceptor de respuesta: errores de la API', () => {
    const capturar = async (status: number, data?: unknown) => {
      const cliente = crearCliente(BASE);
      return interceptores(cliente)
        .respuesta.rejected(errorConRespuesta(status, data))
        .catch((e: unknown) => e as ErrorApi);
    };

    it('usa el mensaje que redacto el servidor', async () => {
      const fallo = await capturar(422, {
        codigo: 'STOCK_INSUFICIENTE',
        mensaje: 'Solo quedan 2 unidades de Paracetamol.',
      });

      // El BackEnd escribe estos mensajes pensando en quien los va a leer;
      // sustituirlos aqui por uno generico perderia informacion util.
      expect(fallo.mensaje).toBe('Solo quedan 2 unidades de Paracetamol.');
      expect(fallo.codigo).toBe('STOCK_INSUFICIENTE');
    });

    it('conserva el estado y los detalles', async () => {
      const fallo = await capturar(400, {
        codigo: 'VALIDACION',
        mensaje: 'Datos invalidos',
        detalles: { errores: ['el costo es obligatorio'] },
      });

      expect(fallo.status).toBe(400);
      expect(fallo.detalles).toEqual({ errores: ['el costo es obligatorio'] });
    });

    /*
     * Cuando el servidor no manda cuerpo -un 502 de un proxy, por ejemplo- se
     * redacta un mensaje segun el estado. La alternativa seria mostrar
     * "undefined" en pantalla.
     */
    it.each([
      [400, /no son validos/i],
      [401, /sesion expiro/i],
      [403, /permisos/i],
      [404, /no existe/i],
      [409, /conflicto/i],
      [422, /no se puede completar/i],
      [429, /limite de peticiones/i],
      [500, /error inesperado/i],
      [502, /error inesperado/i],
    ])(
      'sin cuerpo, el estado %s produce un mensaje presentable',
      async (status, patron) => {
        const fallo = await capturar(status);

        expect(fallo.mensaje).toMatch(patron);
        expect(fallo.codigo).toBe('DESCONOCIDO');
      },
    );
  });

  describe('expiracion de la sesion', () => {
    /*
     * El 401 se maneja en un unico punto. Si cada pantalla tuviera que
     * detectarlo, alguna se olvidaria y dejaria al usuario en una pagina que ya
     * no puede cargar nada, sin explicacion.
     */
    it('limpia el token guardado', async () => {
      const cliente = crearCliente(BASE);
      establecerToken('token-123');

      await interceptores(cliente)
        .respuesta.rejected(errorConRespuesta(401))
        .catch(() => undefined);

      expect(obtenerToken()).toBeNull();
    });

    it('avisa a la aplicacion para que redirija al login', async () => {
      const cliente = crearCliente(BASE);
      const avisar = vi.fn();
      registrarManejadorExpiracion(avisar);

      await interceptores(cliente)
        .respuesta.rejected(errorConRespuesta(401))
        .catch(() => undefined);

      expect(avisar).toHaveBeenCalledTimes(1);
    });

    it('no reacciona asi ante otros errores', async () => {
      const cliente = crearCliente(BASE);
      const avisar = vi.fn();
      registrarManejadorExpiracion(avisar);
      establecerToken('token-123');

      await interceptores(cliente)
        .respuesta.rejected(errorConRespuesta(403))
        .catch(() => undefined);

      // Un 403 significa "no puedes hacer esto", no "vuelve a entrar": cerrar la
      // sesion seria una reaccion desproporcionada y confusa.
      expect(avisar).not.toHaveBeenCalled();
      expect(obtenerToken()).toBe('token-123');
    });

    it('no rompe si nadie registro un manejador', async () => {
      const cliente = crearCliente(BASE);

      await expect(
        interceptores(cliente).respuesta.rejected(errorConRespuesta(401)),
      ).rejects.toBeInstanceOf(ErrorApi);
    });
  });

  describe('ErrorApi', () => {
    it('expone el mensaje tanto por message como por mensaje', () => {
      const fallo = new ErrorApi('VALIDACION', 'Datos invalidos', 400);

      // `message` lo espera JavaScript; `mensaje` mantiene el vocabulario del
      // resto del codigo, que esta en espanol.
      expect(fallo.message).toBe('Datos invalidos');
      expect(fallo.mensaje).toBe('Datos invalidos');
    });

    it('se identifica por su nombre', () => {
      expect(new ErrorApi('X', 'y', 500).name).toBe('ErrorApi');
    });

    it('sigue siendo un Error, para que funcionen catch y stack', () => {
      expect(new ErrorApi('X', 'y', 500)).toBeInstanceOf(Error);
    });

    /*
     * El stock insuficiente tiene su propia comprobacion porque es el unico
     * error que la interfaz trata distinto: no es un fallo del formulario, es
     * una condicion del inventario, y se muestra en el lugar de la linea
     * afectada en vez de como error general.
     */
    it('reconoce el stock insuficiente', () => {
      expect(
        new ErrorApi('STOCK_INSUFICIENTE', 'sin stock', 422).esStockInsuficiente,
      ).toBe(true);
    });

    it('no confunde otros errores con falta de stock', () => {
      expect(new ErrorApi('VALIDACION', 'x', 400).esStockInsuficiente).toBe(false);
    });
  });
});
