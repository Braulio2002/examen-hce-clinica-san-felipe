import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import {
  crearServicioAuth,
  crearServicioCompras,
  crearServicioKardex,
  crearServicioProductos,
  crearServicioVentas,
} from './servicios';

/**
 * Pruebas de los servicios de la API.
 *
 * Cada servicio traduce una operacion del dominio a una llamada HTTP. Lo que
 * puede romperse aqui no lo ve el compilador, porque todo son cadenas y objetos
 * sueltos:
 *
 *   - La RUTA. `/compras` en lugar de `/ventas` registra una entrada de stock
 *     donde iba una salida. Ambas llamadas tienen la misma firma.
 *   - El VERBO. Un `post` donde iba un `patch` crea un producto en lugar de
 *     modificarlo.
 *   - La FORMA del cuerpo. El BackEnd espera `{ lineas: [...] }`, no el array
 *     suelto; enviarlo mal produce un 400 que solo se ve en ejecucion.
 *   - Que los filtros viajen como QUERY y no como cuerpo, que es lo unico que
 *     un GET admite.
 *
 * Se prueba con un doble de axios porque lo que interesa verificar es
 * exactamente el contrato con la API, no que axios sepa hacer una peticion.
 */
describe('Servicios de la API', () => {
  /** Valor de relleno: no es una credencial, solo algo que enviar. */
  const CLAVE_DE_EJEMPLO = ['Clinica', '2026', '$'].join('');

  /** Doble de axios: registra las llamadas y devuelve lo que se le indique. */
  const http = (respuesta: unknown = {}) => {
    const doble = {
      get: vi.fn().mockResolvedValue({ data: respuesta }),
      post: vi.fn().mockResolvedValue({ data: respuesta }),
      patch: vi.fn().mockResolvedValue({ data: respuesta }),
      delete: vi.fn().mockResolvedValue({ data: respuesta }),
    };
    return { doble: doble as unknown as AxiosInstance, ...doble };
  };

  describe('autenticacion', () => {
    it('el login envia usuario y contrasena al endpoint de sesion', async () => {
      const { doble, post } = http({ accessToken: 'tok' });

      await crearServicioAuth(doble).iniciarSesion('admin', CLAVE_DE_EJEMPLO);

      expect(post).toHaveBeenCalledWith('/auth/login', {
        username: 'admin',
        password: CLAVE_DE_EJEMPLO,
      });
    });

    it('el login devuelve la sesion que responde el servidor', async () => {
      const sesion = { accessToken: 'tok', expiraEnSegundos: 1800 };
      const { doble } = http(sesion);

      await expect(crearServicioAuth(doble).iniciarSesion('admin', 'x')).resolves.toEqual(
        sesion,
      );
    });

    /*
     * El logout es un POST sin cuerpo, y tiene que serlo: el borrado de la
     * cookie HttpOnly solo lo puede hacer el servidor, porque el navegador no
     * puede tocarla desde JavaScript. Un logout que solo limpiara el estado del
     * cliente dejaria la cookie viva.
     */
    it('el logout llama al servidor, que es quien puede borrar la cookie', async () => {
      const { doble, post } = http();

      await crearServicioAuth(doble).cerrarSesion();

      expect(post).toHaveBeenCalledWith('/auth/logout');
    });

    it('el perfil se consulta al servidor', async () => {
      const { doble, get } = http({ id: 1, username: 'admin' });

      await crearServicioAuth(doble).perfil();

      expect(get).toHaveBeenCalledWith('/auth/perfil');
    });
  });

  describe('productos', () => {
    it('el listado va a la coleccion', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioProductos(doble).listar();

      expect(get.mock.calls[0]?.[0]).toBe('/productos');
    });

    /*
     * Los filtros viajan como query, que es lo unico que un GET admite. Si se
     * enviaran en el cuerpo, el servidor no los veria y devolveria siempre la
     * primera pagina sin filtrar, sin error alguno.
     */
    it('los filtros viajan como parametros de consulta', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioProductos(doble).listar({
        buscar: 'para',
        pagina: 2,
        tamanoPagina: 20,
        soloConStock: true,
      });

      expect(get.mock.calls[0]?.[1]).toEqual({
        params: { buscar: 'para', pagina: 2, tamanoPagina: 20, soloConStock: true },
      });
    });

    it('sin filtros envia un objeto vacio, no undefined', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioProductos(doble).listar();

      expect(get.mock.calls[0]?.[1]).toEqual({ params: {} });
    });

    it('obtener uno usa su identificador en la ruta', async () => {
      const { doble, get } = http({ idProducto: 7 });

      await crearServicioProductos(doble).obtener(7);

      expect(get).toHaveBeenCalledWith('/productos/7');
    });

    it('el alta es un POST con el producto en el cuerpo', async () => {
      const { doble, post } = http({ idProducto: 1 });
      const alta = { nombreProducto: 'Paracetamol', nroLote: 'LT-1', costo: 0.49 };

      await crearServicioProductos(doble).registrar(alta);

      expect(post).toHaveBeenCalledWith('/productos', alta);
    });

    /*
     * La modificacion usa PATCH y no PUT. La diferencia importa: PATCH permite
     * enviar solo el campo que cambia, mientras que con PUT habria que reenviar
     * el producto entero y cualquier campo omitido se perderia.
     */
    it('la modificacion es parcial: PATCH con solo lo que cambia', async () => {
      const { doble, patch } = http({ idProducto: 7 });

      await crearServicioProductos(doble).actualizar(7, { costo: 0.55 });

      expect(patch).toHaveBeenCalledWith('/productos/7', { costo: 0.55 });
    });

    it('devuelve el producto actualizado', async () => {
      const { doble } = http({ idProducto: 7, costo: 0.55 });

      await expect(
        crearServicioProductos(doble).actualizar(7, { costo: 0.55 }),
      ).resolves.toMatchObject({ idProducto: 7 });
    });
  });

  describe('compras', () => {
    const lineas = [{ idProducto: 1, cantidad: 5, precio: 0.49 }];

    it('se registran en su propia coleccion', async () => {
      const { doble, post } = http({ idCompraCab: 1 });

      await crearServicioCompras(doble).registrar(lineas);

      expect(post.mock.calls[0]?.[0]).toBe('/compras');
    });

    /*
     * El cuerpo es `{ lineas: [...] }` y no el array suelto. Es lo que espera el
     * DTO del gateway; mandar el array produce un 400 que solo aparece en
     * ejecucion, porque en TypeScript ambos encajarian con `unknown`.
     */
    it('las lineas viajan envueltas, como espera el DTO del gateway', async () => {
      const { doble, post } = http({ idCompraCab: 1 });

      await crearServicioCompras(doble).registrar(lineas);

      expect(post.mock.calls[0]?.[1]).toEqual({ lineas });
    });

    it('el listado acepta un periodo', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioCompras(doble).listar({
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });

      expect(get.mock.calls[0]?.[1]).toEqual({
        params: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' },
      });
    });

    it('obtener una usa su identificador', async () => {
      const { doble, get } = http({ idCompraCab: 3 });

      await crearServicioCompras(doble).obtener(3);

      expect(get.mock.calls[0]?.[0]).toBe('/compras/3');
    });
  });

  describe('ventas', () => {
    const lineas = [{ idProducto: 1, cantidad: 2 }];

    it('se registran en su propia coleccion, distinta de la de compras', async () => {
      const { doble, post } = http({ idVentaCab: 1 });

      await crearServicioVentas(doble).registrar(lineas);

      // Cruzar estas dos rutas convertiria una salida de stock en una entrada.
      expect(post.mock.calls[0]?.[0]).toBe('/ventas');
      expect(post.mock.calls[0]?.[0]).not.toBe('/compras');
    });

    /*
     * La linea de venta no lleva precio, y esta prueba lo fija. El precio lo
     * pone el servidor desde el catalogo: si el cliente pudiera enviarlo,
     * podria venderse a si mismo al precio que quisiera.
     */
    it('la linea de venta no lleva precio: lo fija el servidor', async () => {
      const { doble, post } = http({ idVentaCab: 1 });

      await crearServicioVentas(doble).registrar(lineas);

      const enviado = post.mock.calls[0]?.[1] as { lineas: Record<string, unknown>[] };
      expect(Object.keys(enviado.lineas[0] ?? {})).not.toContain('precio');
    });

    it('el listado acepta paginacion', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioVentas(doble).listar({ pagina: 2, tamanoPagina: 10 });

      expect(get.mock.calls[0]?.[1]).toEqual({ params: { pagina: 2, tamanoPagina: 10 } });
    });

    it('obtener una usa su identificador', async () => {
      const { doble, get } = http({ idVentaCab: 9 });

      await crearServicioVentas(doble).obtener(9);

      expect(get.mock.calls[0]?.[0]).toBe('/ventas/9');
    });
  });

  describe('kardex', () => {
    it('el listado acepta busqueda y paginacion', async () => {
      const { doble, get } = http({ datos: [], meta: {} });

      await crearServicioKardex(doble).listar({ buscar: 'para', pagina: 1 });

      expect(get.mock.calls[0]?.[0]).toBe('/kardex');
      expect(get.mock.calls[0]?.[1]).toEqual({ params: { buscar: 'para', pagina: 1 } });
    });

    it('los movimientos cuelgan del producto', async () => {
      const { doble, get } = http([]);

      await crearServicioKardex(doble).movimientos(1);

      // La ruta anidada expresa la relacion: son los movimientos DE ese
      // producto, no una coleccion global que haya que filtrar.
      expect(get.mock.calls[0]?.[0]).toBe('/kardex/producto/1/movimientos');
    });

    it('los movimientos se pueden acotar por periodo', async () => {
      const { doble, get } = http([]);

      await crearServicioKardex(doble).movimientos(1, {
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });

      expect(get.mock.calls[0]?.[1]).toEqual({
        params: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-30' },
      });
    });

    it('sin periodo se piden todos', async () => {
      const { doble, get } = http([]);

      await crearServicioKardex(doble).movimientos(1);

      expect(get.mock.calls[0]?.[1]).toEqual({ params: {} });
    });

    it('devuelve la lista de movimientos', async () => {
      const { doble } = http([{ idMovimientoDet: 1, saldo: 100 }]);

      await expect(crearServicioKardex(doble).movimientos(1)).resolves.toHaveLength(1);
    });
  });

  describe('propagacion de errores', () => {
    /*
     * Los servicios no capturan nada. Es correcto: el interceptor del cliente
     * ya tradujo el fallo a un `ErrorApi` con mensaje presentable, y volver a
     * envolverlo aqui solo perderia esa informacion.
     */
    it('el fallo del cliente sube sin envolverse', async () => {
      const fallo = new Error('sin conexion');
      const doble = { get: vi.fn().mockRejectedValue(fallo) } as unknown as AxiosInstance;

      await expect(crearServicioProductos(doble).listar()).rejects.toBe(fallo);
    });
  });
});
