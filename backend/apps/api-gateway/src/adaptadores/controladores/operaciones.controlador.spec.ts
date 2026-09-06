import type { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';

import { PATRONES_CATALOGO, PATRONES_INVENTARIO } from '@hce/compartido';

import { ListarComprasDto } from '../dto/compra.dto';
import { ListarKardexDto } from '../dto/kardex.dto';
import { ListarProductosDto } from '../dto/producto.dto';
import { ListarVentasDto } from '../dto/venta.dto';
import type { UsuarioAutenticado } from '../seguridad/estrategias/jwt.estrategia';

import { ComprasControlador } from './compras.controlador';
import { KardexControlador } from './kardex.controlador';
import { ProductosControlador } from './productos.controlador';
import { SaludControlador } from './salud.controlador';
import { VentasControlador } from './ventas.controlador';

/**
 * Pruebas de los controladores REST de operaciones del gateway.
 *
 * Los cinco comparten una unica responsabilidad -traducir HTTP a un mensaje
 * RPC- asi que se agrupan en un archivo en lugar de repetir cinco veces el
 * mismo andamiaje. Separarlos solo anadiria ficheros, no claridad.
 *
 * Lo que merece prueba aqui no es que "llamen al microservicio", sino tres
 * cosas concretas que se pueden romper sin que nada avise:
 *
 *   1. El PATRON. Es una cadena; una equivocada manda la compra al procedimiento
 *      de venta y el compilador no dice nada. Se compara contra la constante
 *      compartida, que es el contrato entre gateway y microservicio.
 *
 *   2. El USUARIO. En toda escritura, el `usuarioApp` que se propaga sale del
 *      token ya validado y nunca del cuerpo de la peticion. Si saliera del
 *      cuerpo, cualquiera podria firmar una venta con el nombre de otro y la
 *      auditoria de la base quedaria inservible.
 *
 *   3. Lo que NO se reenvia. El identificador del recurso viene de la ruta, no
 *      del cuerpo, y el cliente no puede colar campos de mas.
 */
describe('Controladores REST de operaciones', () => {
  const usuario: UsuarioAutenticado = {
    id: 1,
    username: 'farmacia',
    nombre: 'Responsable de Farmacia',
    rol: 'FARMACIA',
    expiraEn: new Date('2026-09-30T00:00:00Z'),
  };

  /** Respuesta cualquiera: estos controladores no la interpretan, solo la pasan. */
  const RESPUESTA_CUALQUIERA = { ok: true };

  const cliente = (respuesta: unknown = RESPUESTA_CUALQUIERA) => {
    const send = jest.fn().mockReturnValue(of(respuesta));
    return { doble: { send } as unknown as ClientProxy, send };
  };

  /**
   * Construye un DTO de listado como lo hace el ValidationPipe: instancia real
   * de la clase -con sus valores por defecto de paginacion- y encima lo que la
   * prueba quiera fijar. Un objeto literal no valdria, porque no llevaria los
   * valores por defecto que el controlador espera encontrar.
   */
  const filtro = <T extends object>(Clase: new () => T, campos: Partial<T>): T =>
    Object.assign(new Clase(), campos);

  const patronEnviado = (send: jest.Mock): unknown => send.mock.calls[0]?.[0];
  const mensajeEnviado = (send: jest.Mock): Record<string, unknown> =>
    (send.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>;

  describe('ProductosControlador', () => {
    it('registra usando el patron de alta del catalogo', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).registrar(
        { nombreProducto: 'Paracetamol 500 mg', nroLote: 'LT-1', costo: 0.49 },
        usuario,
      );

      expect(patronEnviado(send)).toBe(PATRONES_CATALOGO.REGISTRAR_PRODUCTO);
    });

    it('propaga los datos del producto tal como llegaron', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).registrar(
        {
          nombreProducto: 'Paracetamol 500 mg',
          nroLote: 'LT-1',
          costo: 0.49,
          precioVenta: 0.66,
        },
        usuario,
      );

      expect(mensajeEnviado(send)).toMatchObject({
        nombreProducto: 'Paracetamol 500 mg',
        nroLote: 'LT-1',
        costo: 0.49,
        precioVenta: 0.66,
      });
    });

    /*
     * El usuario que queda en la auditoria de la base sale del token. Es la
     * diferencia entre un registro de auditoria fiable y uno que el propio
     * cliente puede falsificar mandando otro nombre en el cuerpo.
     */
    it('firma el alta con el usuario del token, no con uno enviado por el cliente', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).registrar(
        { nombreProducto: 'X', nroLote: 'LT-1', costo: 1 },
        usuario,
      );

      expect(mensajeEnviado(send).usuarioApp).toBe('farmacia');
    });

    it('actualiza tomando el identificador de la ruta', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).actualizar(7, { costo: 0.55 }, usuario);

      expect(patronEnviado(send)).toBe(PATRONES_CATALOGO.ACTUALIZAR_PRODUCTO);
      expect(mensajeEnviado(send)).toMatchObject({ idProducto: 7, costo: 0.55 });
    });

    it('la actualizacion tambien queda firmada', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).actualizar(7, { costo: 0.55 }, usuario);

      expect(mensajeEnviado(send).usuarioApp).toBe('farmacia');
    });

    it('lista reenviando los criterios de busqueda y paginacion', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).listar(
        filtro(ListarProductosDto, { buscar: 'para', pagina: 2 }),
      );

      expect(patronEnviado(send)).toBe(PATRONES_CATALOGO.LISTAR_PRODUCTOS);
      expect(mensajeEnviado(send)).toMatchObject({ buscar: 'para', pagina: 2 });
    });

    it('obtiene un producto por el identificador de la ruta', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).obtener(7);

      expect(patronEnviado(send)).toBe(PATRONES_CATALOGO.OBTENER_PRODUCTO);
      expect(mensajeEnviado(send)).toEqual({ idProducto: 7 });
    });

    it('la baja usa el patron de eliminacion y queda firmada', async () => {
      const { doble, send } = cliente();

      await new ProductosControlador(doble).eliminar(7, usuario);

      expect(patronEnviado(send)).toBe(PATRONES_CATALOGO.ELIMINAR_PRODUCTO);
      expect(mensajeEnviado(send)).toEqual({ idProducto: 7, usuarioApp: 'farmacia' });
    });
  });

  describe('ComprasControlador', () => {
    const lineas = [{ idProducto: 1, cantidad: 5, precio: 0.49 }];

    it('registra la compra con su patron', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).registrar({ lineas }, usuario);

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.REGISTRAR_COMPRA);
    });

    it('reenvia las lineas intactas', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).registrar({ lineas }, usuario);

      expect(mensajeEnviado(send).lineas).toEqual(lineas);
    });

    it('la compra queda firmada por el usuario autenticado', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).registrar({ lineas }, usuario);

      expect(mensajeEnviado(send).usuarioApp).toBe('farmacia');
    });

    /*
     * Solo se reenvian `lineas` y `usuarioApp`. Aunque el DTO ya descarta lo que
     * no declara, esta prueba fija el contrato del mensaje RPC: si manana alguien
     * pasara el cuerpo entero con un spread, se veria aqui.
     */
    it('no reenvia mas campos que los del contrato', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).registrar({ lineas }, usuario);

      expect(
        Object.keys(mensajeEnviado(send)).toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(['lineas', 'usuarioApp']);
    });

    it('lista compras reenviando el filtro por periodo', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).listar(
        filtro(ListarComprasDto, { fechaDesde: '2026-09-01' }),
      );

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.LISTAR_COMPRAS);
      expect(mensajeEnviado(send)).toMatchObject({ fechaDesde: '2026-09-01' });
    });

    it('obtiene una compra por el identificador de la ruta', async () => {
      const { doble, send } = cliente();

      await new ComprasControlador(doble).obtener(3);

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.OBTENER_COMPRA);
      expect(mensajeEnviado(send)).toEqual({ idCompraCab: 3 });
    });
  });

  describe('VentasControlador', () => {
    const lineas = [{ idProducto: 1, cantidad: 2 }];

    it('registra la venta con su patron', async () => {
      const { doble, send } = cliente();

      await new VentasControlador(doble).registrar({ lineas }, usuario);

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.REGISTRAR_VENTA);
    });

    /*
     * La linea de venta no lleva precio, y esta prueba lo deja escrito. El
     * precio lo pone el servidor desde el catalogo: si el cliente pudiera
     * enviarlo, podria venderse a si mismo al precio que quisiera.
     */
    it('la linea de venta no lleva precio: lo fija el servidor', async () => {
      const { doble, send } = cliente();

      await new VentasControlador(doble).registrar({ lineas }, usuario);

      const enviadas = mensajeEnviado(send).lineas as Record<string, unknown>[];
      expect(
        Object.keys(enviadas[0] ?? {}).toSorted((a, b) => a.localeCompare(b)),
      ).toEqual(['cantidad', 'idProducto']);
    });

    it('la venta queda firmada por el usuario autenticado', async () => {
      const { doble, send } = cliente();

      await new VentasControlador(doble).registrar({ lineas }, usuario);

      expect(mensajeEnviado(send).usuarioApp).toBe('farmacia');
    });

    it('lista ventas reenviando el filtro por periodo', async () => {
      const { doble, send } = cliente();

      await new VentasControlador(doble).listar(
        filtro(ListarVentasDto, { fechaHasta: '2026-09-30' }),
      );

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.LISTAR_VENTAS);
      expect(mensajeEnviado(send)).toMatchObject({ fechaHasta: '2026-09-30' });
    });

    it('obtiene una venta por el identificador de la ruta', async () => {
      const { doble, send } = cliente();

      await new VentasControlador(doble).obtener(9);

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.OBTENER_VENTA);
      expect(mensajeEnviado(send)).toEqual({ idVentaCab: 9 });
    });
  });

  describe('KardexControlador', () => {
    it('lista el Kardex reenviando busqueda y paginacion', async () => {
      const { doble, send } = cliente();

      await new KardexControlador(doble).listar(
        filtro(ListarKardexDto, { buscar: 'para', pagina: 1 }),
      );

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.LISTAR_KARDEX);
      expect(mensajeEnviado(send)).toMatchObject({ buscar: 'para', pagina: 1 });
    });

    it('los movimientos combinan el producto de la ruta con el periodo del query', async () => {
      const { doble, send } = cliente();

      await new KardexControlador(doble).movimientos(1, {
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });

      expect(patronEnviado(send)).toBe(PATRONES_INVENTARIO.MOVIMIENTOS_PRODUCTO);
      expect(mensajeEnviado(send)).toEqual({
        idProducto: 1,
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-30',
      });
    });

    it('sin periodo consulta el historial completo del producto', async () => {
      const { doble, send } = cliente();

      await new KardexControlador(doble).movimientos(1, {});

      expect(mensajeEnviado(send)).toEqual({
        idProducto: 1,
        fechaDesde: undefined,
        fechaHasta: undefined,
      });
    });
  });

  describe('SaludControlador', () => {
    /*
     * El endpoint de salud es lo que consulta el `healthcheck` de Docker para
     * decidir si el contenedor esta vivo. Es publico a proposito: si exigiera
     * token, el orquestador no podria comprobarlo.
     */
    it('informa de que el servicio esta operativo', () => {
      expect(new SaludControlador().estado()).toMatchObject({
        estado: 'operativo',
        servicio: 'api-gateway',
      });
    });

    it('incluye el tiempo activo, util para detectar reinicios en bucle', () => {
      const estado = new SaludControlador().estado();

      expect(estado.tiempoActivoSegundos).toBeGreaterThanOrEqual(0);
    });

    it('incluye una marca de tiempo con formato ISO', () => {
      expect(new SaludControlador().estado().marcaTiempo).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    /*
     * La version sale de `npm_package_version`, que npm inyecta al arrancar por
     * script. Fuera de ese contexto -por ejemplo, ejecutando el binario
     * compilado directamente- no existe, y sin el respaldo la respuesta de salud
     * llevaria `undefined` como version.
     */
    it('informa de la version que inyecta npm al arrancar', () => {
      const previa = process.env.npm_package_version;
      process.env.npm_package_version = '2.4.0';

      try {
        expect(new SaludControlador().estado().version).toBe('2.4.0');
      } finally {
        if (previa === undefined) {
          process.env = Object.fromEntries(
            Object.entries(process.env).filter(([c]) => c !== 'npm_package_version'),
          );
        } else {
          process.env.npm_package_version = previa;
        }
      }
    });

    it('sin esa variable usa una version de respaldo, no undefined', () => {
      const previa = process.env.npm_package_version;
      process.env = Object.fromEntries(
        Object.entries(process.env).filter(([c]) => c !== 'npm_package_version'),
      );

      try {
        expect(new SaludControlador().estado().version).toBe('1.0.0');
      } finally {
        if (previa !== undefined) process.env.npm_package_version = previa;
      }
    });

    it('no revela nada sensible sobre el entorno', () => {
      // Un endpoint publico no debe filtrar rutas, cadenas de conexion ni
      // variables de entorno: seria reconocimiento gratis para un atacante.
      const claves = Object.keys(new SaludControlador().estado()).toSorted((a, b) =>
        a.localeCompare(b),
      );

      expect(claves).toEqual([
        'estado',
        'marcaTiempo',
        'servicio',
        'tiempoActivoSegundos',
        'version',
      ]);
    });
  });
});
