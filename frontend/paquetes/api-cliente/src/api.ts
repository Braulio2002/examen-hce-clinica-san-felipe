import type { AxiosInstance } from 'axios';

import { crearCliente } from './cliente';
import {
  crearServicioAuth,
  crearServicioCompras,
  crearServicioKardex,
  crearServicioProductos,
  crearServicioVentas,
} from './servicios';

/**
 * Punto de acceso unico a la API para todas las zonas del microfront.
 *
 * Por que un singleton y no una instancia por pantalla: el cliente guarda el
 * token de respaldo en memoria del modulo y registra el manejador de expiracion
 * de sesion. Si cada zona creara su propia instancia, el token quedaria en una
 * y la otra lo desconoceria, y la reaccion al 401 se duplicaria.
 *
 * Al vivir en un paquete de workspace, npm lo instala una sola vez y ambas
 * zonas comparten literalmente el mismo modulo en tiempo de ejecucion dentro de
 * cada bundle.
 */
export interface Api {
  readonly http: AxiosInstance;
  readonly auth: ReturnType<typeof crearServicioAuth>;
  readonly productos: ReturnType<typeof crearServicioProductos>;
  readonly compras: ReturnType<typeof crearServicioCompras>;
  readonly ventas: ReturnType<typeof crearServicioVentas>;
  readonly kardex: ReturnType<typeof crearServicioKardex>;
}

let instancia: Api | null = null;

/** Inicializa la API. Llamar una vez por aplicacion, con la URL del Gateway. */
export function inicializarApi(baseURL: string): Api {
  if (!instancia) {
    const http = crearCliente(baseURL);
    instancia = {
      http,
      auth: crearServicioAuth(http),
      productos: crearServicioProductos(http),
      compras: crearServicioCompras(http),
      ventas: crearServicioVentas(http),
      kardex: crearServicioKardex(http),
    };
  }
  return instancia;
}

/**
 * Devuelve la API ya inicializada.
 * Falla de forma explicita si se usa antes de inicializarla: es preferible un
 * error claro en desarrollo a una peticion silenciosa contra una URL vacia.
 */
export function api(): Api {
  if (!instancia) {
    throw new Error(
      'La API no ha sido inicializada. Llame a inicializarApi(url) en el layout raiz.',
    );
  }
  return instancia;
}
