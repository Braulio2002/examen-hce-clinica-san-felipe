import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pruebas del punto de acceso unico a la API.
 *
 * `inicializarApi` construye el cliente una sola vez y `api()` lo devuelve.
 * Ese singleton es lo que evita que cada pantalla cree su propio cliente axios,
 * lo cual multiplicaria interceptores: el manejador de expiracion de sesion se
 * dispararia varias veces por un solo 401 y el token quedaria en un cliente
 * pero no en los demas.
 *
 * El modulo mantiene estado entre importaciones, asi que cada prueba lo vuelve
 * a cargar limpio con `resetModules`. Sin eso, la prueba que comprueba el error
 * de "no inicializada" pasaria o fallaria segun el orden de ejecucion.
 */
describe('Punto de acceso a la API', () => {
  // https, aunque en desarrollo el Gateway hable http: la URL aqui es un
  // dato de ejemplo y no hay motivo para escribir un protocolo inseguro.
  const BASE = 'https://localhost:4000/api';

  /** Recarga el modulo para que su singleton empiece vacio. */
  const cargarModulo = async () => {
    vi.resetModules();
    return import('./api');
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it('expone los cinco servicios del dominio', async () => {
    const { inicializarApi } = await cargarModulo();

    const instancia = inicializarApi(BASE);

    // Copia y `sort` en lugar de `toSorted`: este paquete compila contra la
    // biblioteca de ES2022, que todavia no declara los metodos inmutables de
    // array. La copia evita ordenar el array original.
    const claves = [...Object.keys(instancia)].sort((a, b) => a.localeCompare(b));

    expect(claves).toEqual(['auth', 'compras', 'http', 'kardex', 'productos', 'ventas']);
  });

  it('el cliente subyacente queda configurado con la URL indicada', async () => {
    const { inicializarApi } = await cargarModulo();

    expect(inicializarApi(BASE).http.defaults.baseURL).toBe(BASE);
  });

  /*
   * Un unico cliente para toda la aplicacion. Con varios, cada uno tendria sus
   * propios interceptores: un solo 401 dispararia el cierre de sesion tantas
   * veces como clientes hubiera, y el token establecido en uno no existiria en
   * los otros.
   */
  it('devuelve siempre la misma instancia', async () => {
    const { inicializarApi } = await cargarModulo();

    expect(inicializarApi(BASE)).toBe(inicializarApi(BASE));
  });

  it('una segunda inicializacion no reemplaza el cliente ya creado', async () => {
    const { inicializarApi } = await cargarModulo();

    const primera = inicializarApi(BASE);
    const segunda = inicializarApi('https://otra-url/api');

    // El layout raiz se puede montar mas de una vez durante la navegacion; que
    // eso rehiciera el cliente perderia el token que ya tenia en memoria.
    expect(segunda).toBe(primera);
    expect(segunda.http.defaults.baseURL).toBe(BASE);
  });

  it('api() devuelve la instancia ya creada', async () => {
    const { inicializarApi, api } = await cargarModulo();

    const instancia = inicializarApi(BASE);

    expect(api()).toBe(instancia);
  });

  /*
   * Fallar de forma explicita es deliberado. La alternativa -crear un cliente
   * con URL vacia- produciria peticiones a rutas relativas que fallarian mucho
   * mas tarde y con un mensaje que no apuntaria a la causa.
   *
   * Este mensaje no es teorico: al pasar a Next 16 el empaquetador descarto el
   * import con efecto secundario que inicializaba la API, y este error fue lo
   * que localizo el problema en el primer intento de inicio de sesion.
   */
  it('api() antes de inicializar falla diciendo exactamente que hacer', async () => {
    const { api } = await cargarModulo();

    expect(() => api()).toThrow(/no ha sido inicializada/i);
    expect(() => api()).toThrow(/inicializarApi/);
  });
});
