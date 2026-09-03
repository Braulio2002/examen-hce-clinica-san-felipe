import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';

import { RespuestaError } from './tipos';

/**
 * Cliente HTTP compartido por las zonas del microfront.
 *
 * MANEJO DEL TOKEN
 * ----------------
 * El API Gateway entrega el JWT de dos formas simultaneas:
 *
 *   1. Cookie HttpOnly  -> es el canal principal. Al no ser accesible desde
 *      JavaScript, un XSS no puede leerla ni exfiltrarla. El navegador la envia
 *      sola siempre que la peticion lleve withCredentials.
 *   2. Cuerpo de la respuesta de login -> se guarda solo en memoria del modulo
 *      y se adjunta como cabecera Authorization. Sirve de respaldo cuando la
 *      cookie no viaja (navegador con cookies de terceros bloqueadas, pruebas
 *      desde otro origen).
 *
 * El token NUNCA se escribe en localStorage ni en sessionStorage: eso anularia
 * la proteccion de la cookie HttpOnly, porque volveria el token legible desde
 * cualquier script inyectado en la pagina.
 */

let tokenEnMemoria: string | null = null;
let alExpirarSesion: (() => void) | null = null;

export function establecerToken(token: string | null): void {
  tokenEnMemoria = token;
}

export function obtenerToken(): string | null {
  return tokenEnMemoria;
}

/** Registra el manejador que se ejecuta cuando la sesion caduca (401). */
export function registrarManejadorExpiracion(manejador: () => void): void {
  alExpirarSesion = manejador;
}

/** Error normalizado que consumen las pantallas. */
export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly status: number,
    readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }

  /**
   * Alias en espanol de `message`.
   * El resto del codigo nombra sus campos en espanol; exponerlo asi evita el
   * salto de idioma en cada pantalla que muestra el error al usuario.
   */
  get mensaje(): string {
    return this.message;
  }

  /** Verdadero cuando el usuario intento vender por encima del stock. */
  get esStockInsuficiente(): boolean {
    return this.codigo === 'STOCK_INSUFICIENTE';
  }
}

export function crearCliente(baseURL: string): AxiosInstance {
  const cliente = axios.create({
    baseURL,
    timeout: 15_000,
    // Imprescindible para que el navegador envie la cookie HttpOnly del JWT.
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  /* ---------------------------------------------------------------------------
     INTERCEPTOR DE PETICION
     Adjunta el token de respaldo y una cabecera de correlacion para poder
     rastrear una peticion a traves del Gateway y los microservicios.
     --------------------------------------------------------------------------- */
  cliente.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      if (tokenEnMemoria) {
        config.headers.set('Authorization', `Bearer ${tokenEnMemoria}`);
      }
      config.headers.set('X-Requested-With', 'XMLHttpRequest');
      return config;
    },
    (error: unknown) => Promise.reject(error),
  );

  /* ---------------------------------------------------------------------------
     INTERCEPTOR DE RESPUESTA
     Traduce cualquier fallo a un ErrorApi con mensaje presentable, y centraliza
     la reaccion a la expiracion del token de 30 minutos.
     --------------------------------------------------------------------------- */
  cliente.interceptors.response.use(
    (respuesta: AxiosResponse) => respuesta,
    (error: AxiosError<RespuestaError>) => {
      // Sin respuesta: el servidor no respondio o la peticion expiro.
      if (!error.response) {
        const esTimeout = error.code === 'ECONNABORTED';
        return Promise.reject(
          new ErrorApi(
            esTimeout ? 'TIMEOUT' : 'SIN_CONEXION',
            esTimeout
              ? 'El servidor tardo demasiado en responder. Intente nuevamente.'
              : 'No se pudo contactar con el servidor. Verifique su conexion.',
            0,
          ),
        );
      }

      const { status, data } = error.response;

      // Sesion expirada o token invalido: se limpia y se avisa a la aplicacion.
      if (status === 401) {
        tokenEnMemoria = null;
        alExpirarSesion?.();
      }

      return Promise.reject(
        new ErrorApi(
          data?.codigo ?? 'DESCONOCIDO',
          data?.mensaje ?? mensajePorDefecto(status),
          status,
          data?.detalles,
        ),
      );
    },
  );

  return cliente;
}

function mensajePorDefecto(status: number): string {
  switch (status) {
    case 400:
      return 'Los datos enviados no son validos.';
    case 401:
      return 'La sesion expiro. Vuelva a iniciar sesion.';
    case 403:
      return 'No cuenta con permisos para realizar esta operacion.';
    case 404:
      return 'El recurso solicitado no existe.';
    case 409:
      return 'El registro entra en conflicto con uno existente.';
    case 422:
      return 'La operacion no se puede completar con los datos actuales.';
    case 429:
      return 'Ha superado el limite de peticiones. Espere unos segundos.';
    default:
      return 'Ocurrio un error inesperado. Intente nuevamente.';
  }
}
