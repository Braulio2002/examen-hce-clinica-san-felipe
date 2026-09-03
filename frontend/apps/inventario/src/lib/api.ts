'use client';

import { Api, inicializarApi } from '@hce/api-cliente';

/**
 * Inicializacion de la API para la zona de inventario.
 *
 * Cada zona del microfront inicializa el cliente por su cuenta con la misma
 * URL: son bundles independientes y no comparten memoria en tiempo de
 * ejecucion. Lo que si comparten es el codigo (paquete @hce/api-cliente) y la
 * cookie HttpOnly del navegador, que es la que realmente sostiene la sesion
 * cuando el usuario cruza de una zona a otra.
 */
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const apiHce: Api = inicializarApi(URL_API);
