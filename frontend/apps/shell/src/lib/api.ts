'use client';

import { Api, inicializarApi } from '@hce/api-cliente';

/**
 * Inicializacion de la API para la zona shell.
 *
 * La URL del Gateway se resuelve en tiempo de compilacion con
 * NEXT_PUBLIC_API_URL, porque quien realiza la peticion es el navegador del
 * usuario y no el contenedor: dentro de Docker el Gateway responde al nombre
 * "api-gateway", pero el navegador solo conoce "localhost:4000".
 */
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const apiHce: Api = inicializarApi(URL_API);
