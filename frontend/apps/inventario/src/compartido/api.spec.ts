import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pruebas de la inicializacion de la API en la zona de inventario.
 *
 * Es un archivo de tres lineas, pero decide dos cosas de las que depende que la
 * zona funcione:
 *
 *   1. De donde sale la URL del Gateway. Se resuelve en tiempo de compilacion
 *      con `NEXT_PUBLIC_API_URL`, y tiene que ser asi: quien hace la peticion es
 *      el navegador del usuario, no el contenedor. Dentro de Docker el Gateway
 *      responde al nombre `api-gateway`, pero el navegador solo conoce
 *      `localhost:4000`. Poner el nombre interno aqui deja la aplicacion
 *      inservible fuera del contenedor, y es un fallo que no se ve hasta
 *      desplegar.
 *
 *   2. Que cada zona inicialice su propio cliente. Shell e inventario son
 *      bundles independientes que no comparten memoria en tiempo de ejecucion;
 *      lo que comparten es el codigo y la cookie HttpOnly del navegador, que es
 *      la que sostiene la sesion al cruzar de una zona a otra.
 */
/*
 * `vi.hoisted` es necesario porque `vi.mock` se eleva por encima de las
 * declaraciones del archivo: sin el, la funcion simulada todavia no existiria
 * cuando se evalua la factoria del modulo.
 */
const dobles = vi.hoisted(() => ({
  inicializarApi: vi.fn().mockReturnValue({ http: {}, auth: {} }),
}));

vi.mock('@hce/api-cliente', () => ({
  inicializarApi: dobles.inicializarApi,
}));

describe('Inicializacion de la API (zona de inventario)', () => {
  /** Recarga el modulo para que su inicializacion vuelva a ejecutarse. */
  const cargar = async () => {
    vi.resetModules();
    return import('./api');
  };

  beforeEach(() => {
    dobles.inicializarApi.mockClear();
  });

  it('inicializa el cliente al importarse', async () => {
    await cargar();

    expect(dobles.inicializarApi).toHaveBeenCalledTimes(1);
  });

  it('expone el cliente ya construido', async () => {
    const { apiHce } = await cargar();

    expect(apiHce).toBeDefined();
  });

  /**
   * Fija la variable durante la prueba y la restaura despues, tanto si estaba
   * como si no. Se usa `delete` sobre una clave literal en lugar de rehacer
   * `process.env`: el tipo `ProcessEnv` de Next exige `NODE_ENV`, y reconstruir
   * el objeto lo pierde.
   */
  const conVariable = async (
    valor: string | undefined,
    prueba: () => Promise<void>,
  ): Promise<void> => {
    const previa = process.env.NEXT_PUBLIC_API_URL;

    if (valor === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = valor;

    try {
      await prueba();
    } finally {
      if (previa === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = previa;
    }
  };

  it('usa la URL que se declaro al compilar', async () => {
    await conVariable('https://hce.clinica.pe/api/v1', async () => {
      const { URL_API } = await cargar();

      expect(URL_API).toBe('https://hce.clinica.pe/api/v1');
      expect(dobles.inicializarApi).toHaveBeenCalledWith('https://hce.clinica.pe/api/v1');
    });
  });

  it('sin esa variable apunta al Gateway local', async () => {
    await conVariable(undefined, async () => {
      const { URL_API } = await cargar();

      // El valor por defecto es el del desarrollo en local, no el nombre
      // interno del contenedor: el navegador no sabe resolver `api-gateway`.
      expect(URL_API).toBe('http://localhost:4000/api/v1');
    });
  });
});
