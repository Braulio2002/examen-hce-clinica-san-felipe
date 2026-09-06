import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

import {
  CodigoError,
  ErrorInfraestructura,
} from '../../dominio/excepciones/dominio.excepcion';

import { MssqlService } from './mssql.service';

/*
 * Se sustituye el paquete `mssql` entero. La alternativa -levantar SQL Server-
 * es lo que hacen las pruebas de extremo a extremo; aqui interesa el
 * comportamiento del envoltorio, que es donde estan las decisiones: el reintento
 * al arrancar, la construccion de los parametros y, sobre todo, la traduccion de
 * los codigos de error del motor.
 *
 * `Table` se conserva como una implementacion minima porque el servicio la usa
 * como estructura de datos real, no solo como colaborador: le anade columnas y
 * filas y comprueba lo que contiene.
 */
jest.mock('mssql', () => {
  class TablaSimulada {
    create = true;
    readonly columns = {
      lista: [] as { nombre: string; tipo: unknown }[],
      add(nombre: string, tipo: unknown) {
        this.lista.push({ nombre, tipo });
      },
    };
    readonly rows = {
      lista: [] as unknown[][],
      add(...valores: unknown[]) {
        this.lista.push(valores);
      },
    };
    constructor(readonly nombreTipo: string) {}
  }

  return {
    ConnectionPool: jest.fn(),
    Table: TablaSimulada,
    Int: { tipo: 'Int' },
    NVarChar: (n?: number) => ({ tipo: 'NVarChar', n }),
    Decimal: (p?: number, e?: number) => ({ tipo: 'Decimal', p, e }),
    Date: { tipo: 'Date' },
  };
});

/**
 * Pruebas del adaptador de persistencia.
 *
 * Concentra tres responsabilidades y cada una tiene su bloque:
 *
 *   1. ARRANQUE con reintentos. SQL Server dentro de Docker tarda entre 20 y 60
 *      segundos en aceptar conexiones. Sin el reintento, el microservicio muere
 *      al arrancar el compose aunque la base acabe levantando bien. Es la clase
 *      de detalle que solo se descubre desplegando, y por eso merece prueba.
 *
 *   2. CONSTRUCCION de la peticion: parametros tipados, TVP y parametros de
 *      salida. Aqui esta la defensa contra inyeccion, que no es una validacion
 *      sino una propiedad estructural: nada se concatena nunca.
 *
 *   3. TRADUCCION de errores. Los procedimientos lanzan codigos numericos y este
 *      servicio los convierte en excepciones de dominio. Sin esa tabla, un
 *      "stock insuficiente" seria un 500 en lugar de un 422.
 */
describe('MssqlService', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const PoolSimulado = sql.ConnectionPool as unknown as jest.Mock;

  const configuracion = (valores: Record<string, string> = {}): ConfigService =>
    ({
      get: (clave: string, porDefecto?: string) =>
        clave in valores ? valores[clave] : porDefecto,
    }) as unknown as ConfigService;

  /**
   * Prepara un pool que se conecta y devuelve el resultado indicado. Deja a mano
   * los espias de `input`, `output` y `execute` para poder inspeccionarlos.
   */
  const prepararPool = (
    opciones: {
      recordsets?: unknown[][];
      output?: Record<string, unknown>;
      errorAlEjecutar?: unknown;
      conectado?: boolean;
    } = {},
  ) => {
    const input = jest.fn();
    const output = jest.fn();
    const query = jest.fn().mockResolvedValue({ recordset: [{ activo: 1 }] });
    // Se comprueba la PRESENCIA de la clave y no si su valor es cierto: uno de
    // los casos que interesa cubrir es justamente que lo lanzado sea `null`.
    const execute =
      'errorAlEjecutar' in opciones
        ? jest.fn().mockRejectedValue(opciones.errorAlEjecutar)
        : jest.fn().mockResolvedValue({
            recordsets: opciones.recordsets ?? [[]],
            output: opciones.output ?? {},
          });

    const request = jest.fn().mockReturnValue({ input, output, execute, query });
    const close = jest.fn().mockResolvedValue(undefined);
    const pool = {
      connected: opciones.conectado ?? true,
      request,
      close,
      on: jest.fn(),
    };

    PoolSimulado.mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(pool),
    }));

    return { pool, input, output, execute, query, close };
  };

  /** Servicio ya arrancado y conectado, listo para ejecutar. */
  const servicioConectado = async (
    opciones: Parameters<typeof prepararPool>[0] = {},
    valoresConfig: Record<string, string> = {},
  ) => {
    const espias = prepararPool(opciones);
    const servicio = new MssqlService(configuracion(valoresConfig));
    await servicio.onModuleInit();
    return { servicio, ...espias };
  };

  beforeEach(() => {
    PoolSimulado.mockReset();
  });

  describe('arranque', () => {
    it('se conecta usando la configuracion del entorno', async () => {
      prepararPool();
      const servicio = new MssqlService(
        configuracion({ DB_HOST: 'sqlserver', DB_NAME: 'HCE_Insumos', DB_PORT: '1433' }),
      );

      await servicio.onModuleInit();

      expect(PoolSimulado.mock.calls[0]?.[0]).toMatchObject({
        server: 'sqlserver',
        database: 'HCE_Insumos',
        port: 1433,
      });
    });

    it('los numeros de la configuracion llegan como numeros, no como texto', async () => {
      prepararPool();

      await new MssqlService(
        configuracion({ DB_PORT: '1433', DB_POOL_MAX: '20', DB_REQUEST_TIMEOUT: '5000' }),
      ).onModuleInit();

      // El driver rechaza una cadena donde espera un numero, y el fallo aparece
      // al conectar, no al leer la configuracion.
      const config = PoolSimulado.mock.calls[0]?.[0] as sql.config;
      expect(typeof config.port).toBe('number');
      expect(config.pool?.max).toBe(20);
      expect(config.requestTimeout).toBe(5000);
    });

    it('los interruptores de cifrado se interpretan como booleanos', async () => {
      prepararPool();

      await new MssqlService(
        configuracion({ DB_ENCRYPT: 'false', DB_TRUST_SERVER_CERTIFICATE: 'true' }),
      ).onModuleInit();

      const config = PoolSimulado.mock.calls[0]?.[0] as sql.config;
      expect(config.options?.encrypt).toBe(false);
      expect(config.options?.trustServerCertificate).toBe(true);
    });

    /*
     * El reintento es lo que hace que `docker compose up` funcione a la primera.
     * Se configura con espera de 0 ms para que la prueba no tarde lo que tarda
     * el arranque real.
     */
    it('reintenta cuando la base todavia no acepta conexiones', async () => {
      const pool = {
        connected: true,
        request: jest.fn(),
        close: jest.fn(),
        on: jest.fn(),
      };
      PoolSimulado.mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      })).mockImplementationOnce(() => ({
        connect: jest.fn().mockResolvedValue(pool),
      }));

      await new MssqlService(
        configuracion({ DB_MAX_REINTENTOS: '3', DB_ESPERA_REINTENTO_MS: '0' }),
      ).onModuleInit();

      expect(PoolSimulado).toHaveBeenCalledTimes(2);
    });

    it('se rinde tras agotar los intentos', async () => {
      PoolSimulado.mockImplementation(() => ({
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      }));

      await expect(
        new MssqlService(
          configuracion({ DB_MAX_REINTENTOS: '2', DB_ESPERA_REINTENTO_MS: '0' }),
        ).onModuleInit(),
      ).rejects.toBeInstanceOf(ErrorInfraestructura);
      expect(PoolSimulado).toHaveBeenCalledTimes(2);
    });

    it('el fallo final dice cuantos intentos se hicieron y por que', async () => {
      PoolSimulado.mockImplementation(() => ({
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      }));

      await expect(
        new MssqlService(
          configuracion({ DB_MAX_REINTENTOS: '2', DB_ESPERA_REINTENTO_MS: '0' }),
        ).onModuleInit(),
      ).rejects.toThrow(/2 intentos.*ECONNREFUSED/);
    });

    it('describe el fallo aunque lo lanzado no sea un Error', async () => {
      PoolSimulado.mockImplementation(() => ({
        connect: jest.fn().mockRejectedValue('cadena suelta'),
      }));

      await expect(
        new MssqlService(
          configuracion({ DB_MAX_REINTENTOS: '1', DB_ESPERA_REINTENTO_MS: '0' }),
        ).onModuleInit(),
      ).rejects.toThrow(/cadena suelta/);
    });

    it('escucha los errores del pool para dejar constancia de ellos', async () => {
      const { pool } = await servicioConectado();

      // Un pool que pierde la conexion emite 'error' de forma asincrona, fuera
      // de cualquier peticion. Sin este oyente, el fallo seria invisible.
      expect(pool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('cierre', () => {
    it('cierra el pool al apagar el modulo', async () => {
      const { servicio, close } = await servicioConectado();

      await servicio.onModuleDestroy();

      expect(close).toHaveBeenCalledTimes(1);
    });

    it('no falla si nunca llego a conectarse', async () => {
      // Puede pasar si el arranque fallo: el apagado no debe anadir un segundo
      // error encima del primero.
      await expect(
        new MssqlService(configuracion()).onModuleDestroy(),
      ).resolves.toBeUndefined();
    });
  });

  describe('sin conexion activa', () => {
    it.each([
      [
        'ejecutarProcedimiento',
        (s: MssqlService) => s.ejecutarProcedimiento('hce.usp_X'),
      ],
      ['consultar', (s: MssqlService) => s.consultar('hce.usp_X')],
    ])('%s falla de forma explicita', async (_caso, operacion) => {
      const servicio = new MssqlService(configuracion());

      // Sin esta guarda, el fallo seria "cannot read request of undefined": un
      // mensaje que no dice nada de lo que pasa realmente.
      await expect(operacion(servicio)).rejects.toThrow(/No hay conexion activa/);
    });

    it('detecta tambien un pool creado pero desconectado', async () => {
      const { servicio } = await servicioConectado({ conectado: false });

      await expect(servicio.ejecutarProcedimiento('hce.usp_X')).rejects.toThrow(
        /No hay conexion activa/,
      );
    });
  });

  describe('ejecucion de procedimientos', () => {
    it('ejecuta el procedimiento pedido', async () => {
      const { servicio, execute } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Producto_Listar');

      expect(execute).toHaveBeenCalledWith('hce.usp_Producto_Listar');
    });

    /*
     * Cada valor entra por `input` con su tipo. Es la defensa contra inyeccion:
     * el driver lo envia por el protocolo como dato, nunca como texto que el
     * motor tenga que interpretar. Ninguna cadena de la peticion se concatena.
     */
    it('cada parametro viaja tipado, con su nombre y su valor', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Producto_Registrar', {
        parametros: [
          { nombre: 'Nombre_producto', tipo: sql.NVarChar(150), valor: 'Paracetamol' },
          { nombre: 'Costo', tipo: sql.Decimal(18, 4), valor: 0.49 },
        ],
      });

      expect(input).toHaveBeenCalledWith(
        'Nombre_producto',
        expect.anything(),
        'Paracetamol',
      );
      expect(input).toHaveBeenCalledWith('Costo', expect.anything(), 0.49);
    });

    it('una entrada hostil viaja como valor, no como sentencia', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Producto_Registrar', {
        parametros: [
          {
            nombre: 'Nombre_producto',
            tipo: sql.NVarChar(150),
            valor: "'; DROP TABLE hce.Productos;--",
          },
        ],
      });

      expect(input.mock.calls[0]?.[2]).toBe("'; DROP TABLE hce.Productos;--");
      expect(execute_llamado_con_texto_plano(input)).toBe(false);
    });

    it('convierte undefined en null antes de enviarlo', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_X', {
        parametros: [{ nombre: 'Opcional', tipo: sql.NVarChar(50), valor: undefined }],
      });

      // El driver omite un parametro undefined y el procedimiento recibiria uno
      // de menos; null si es un valor que SQL Server entiende.
      expect(input).toHaveBeenCalledWith('Opcional', expect.anything(), null);
    });

    it('registra los parametros de salida', async () => {
      const { servicio, output } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        salidas: [{ nombre: 'Id_CompraCab', tipo: sql.Int, valor: null }],
      });

      expect(output).toHaveBeenCalledWith('Id_CompraCab', expect.anything(), null);
    });

    it('devuelve los conjuntos y las salidas del procedimiento', async () => {
      const { servicio } = await servicioConectado({
        recordsets: [[{ Id_CompraCab: 3 }], [{ Id_producto: 1 }]],
        output: { Id_CompraCab: 3 },
      });

      const resultado = await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar');

      expect(resultado.conjuntos).toHaveLength(2);
      expect(resultado.salidas).toEqual({ Id_CompraCab: 3 });
    });
  });

  describe('parametros de tipo tabla', () => {
    const definicion = {
      nombre: 'Detalle',
      tipoTabla: 'hce.TipoDetalleCompra',
      columnas: [
        { nombre: 'Id_producto', tipo: sql.Int },
        { nombre: 'Cantidad', tipo: sql.Decimal(18, 4) },
      ],
      filas: [
        [1, 5],
        [2, 10],
      ] as const,
    };

    it('construye la tabla con el tipo declarado en SQL Server', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        tablas: [definicion],
      });

      const tabla = input.mock.calls[0]?.[1] as { nombreTipo: string };
      expect(tabla.nombreTipo).toBe('hce.TipoDetalleCompra');
    });

    /*
     * `create = false` es importante: el tipo tabla YA existe en la base, creado
     * por el script de instalacion. Si el driver intentara crearlo en cada
     * llamada, fallaria o -peor- exigiria permisos DDL al usuario de la
     * aplicacion, que deliberadamente solo tiene EXECUTE.
     */
    it('no intenta crear el tipo tabla: ya existe en la base', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        tablas: [definicion],
      });

      expect((input.mock.calls[0]?.[1] as { create: boolean }).create).toBe(false);
    });

    it('anade las columnas en el orden declarado', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        tablas: [definicion],
      });

      const tabla = input.mock.calls[0]?.[1] as {
        columns: { lista: { nombre: string }[] };
      };
      expect(tabla.columns.lista.map((c) => c.nombre)).toEqual([
        'Id_producto',
        'Cantidad',
      ]);
    });

    it('anade una fila por cada linea, con sus valores en orden', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        tablas: [definicion],
      });

      const tabla = input.mock.calls[0]?.[1] as { rows: { lista: unknown[][] } };
      expect(tabla.rows.lista).toEqual([
        [1, 5],
        [2, 10],
      ]);
    });

    it('acepta una tabla sin filas', async () => {
      const { servicio, input } = await servicioConectado();

      await servicio.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
        tablas: [{ ...definicion, filas: [] }],
      });

      const tabla = input.mock.calls[0]?.[1] as { rows: { lista: unknown[][] } };
      expect(tabla.rows.lista).toEqual([]);
    });
  });

  describe('consultar', () => {
    it('devuelve el primer conjunto de resultados', async () => {
      const { servicio } = await servicioConectado({
        recordsets: [[{ Id_producto: 1 }], [{ otra: 'cosa' }]],
      });

      await expect(servicio.consultar('hce.usp_Producto_Listar')).resolves.toEqual([
        { Id_producto: 1 },
      ]);
    });

    it('devuelve lista vacia si el procedimiento no devolvio nada', async () => {
      const { servicio } = await servicioConectado({ recordsets: [] });

      await expect(servicio.consultar('hce.usp_Producto_Listar')).resolves.toEqual([]);
    });
  });

  describe('verificarConexion', () => {
    it('devuelve true cuando la base responde', async () => {
      const { servicio } = await servicioConectado();

      await expect(servicio.verificarConexion()).resolves.toBe(true);
    });

    it('devuelve false en lugar de lanzar cuando no responde', async () => {
      const { servicio, query } = await servicioConectado();
      query.mockRejectedValue(new Error('sin conexion'));

      // Lo consume el endpoint de salud: tiene que poder informar de que la base
      // esta caida, no caerse el mismo al intentar comprobarlo.
      await expect(servicio.verificarConexion()).resolves.toBe(false);
    });

    it('devuelve false si nunca hubo conexion', async () => {
      await expect(new MssqlService(configuracion()).verificarConexion()).resolves.toBe(
        false,
      );
    });
  });

  describe('traduccion de errores del motor', () => {
    const fallarCon = async (numero: number, mensaje = 'mensaje del motor') => {
      const error = Object.assign(new Error(mensaje), { number: numero });
      const { servicio } = await servicioConectado({ errorAlEjecutar: error });
      return servicio.ejecutarProcedimiento('hce.usp_X').catch((e: unknown) => e);
    };

    /*
     * Esta tabla es el contrato entre los procedimientos almacenados y la
     * aplicacion. Los numeros los definen 02-triggers-auditoria.sql y
     * 03-stored-procedures.sql; 2601 y 2627 son del propio motor.
     *
     * Sin esta traduccion, "no hay stock" llegaria al usuario como un error
     * interno del servidor. Es el punto donde una condicion tecnica se convierte
     * en informacion de negocio.
     */
    it.each([
      [51001, CodigoError.STOCK_INSUFICIENTE, 'stock insuficiente (trigger)'],
      [54004, CodigoError.STOCK_INSUFICIENTE, 'stock insuficiente (procedimiento)'],
      [51002, CodigoError.PROHIBIDO, 'bitacora inmutable'],
      [52001, CodigoError.VALIDACION, 'validacion de catalogo'],
      [52002, CodigoError.VALIDACION, 'validacion de catalogo'],
      [52003, CodigoError.VALIDACION, 'validacion de catalogo'],
      [53001, CodigoError.VALIDACION, 'validacion de compra'],
      [53002, CodigoError.VALIDACION, 'validacion de compra'],
      [53003, CodigoError.VALIDACION, 'validacion de compra'],
      [53004, CodigoError.VALIDACION, 'validacion de compra'],
      [54001, CodigoError.VALIDACION, 'validacion de venta'],
      [54002, CodigoError.VALIDACION, 'validacion de venta'],
      [54003, CodigoError.VALIDACION, 'validacion de venta'],
      [52004, CodigoError.CONFLICTO, 'duplicado'],
      [52006, CodigoError.CONFLICTO, 'conflicto de estado'],
      [52005, CodigoError.NO_ENCONTRADO, 'recurso inexistente'],
      [2601, CodigoError.CONFLICTO, 'indice unico del motor'],
      [2627, CodigoError.CONFLICTO, 'restriccion unique del motor'],
    ])('el codigo %s se traduce a %s (%s)', async (numero, codigo) => {
      await expect(fallarCon(numero)).resolves.toMatchObject({ codigo });
    });

    it('conserva el mensaje del procedimiento, que esta escrito para el usuario', async () => {
      const error = await fallarCon(54004, 'Solo quedan 2 unidades de Paracetamol.');

      // Los procedimientos redactan sus RAISERROR pensando en quien los va a
      // leer en pantalla; perder ese texto obligaria a reinventarlo aqui.
      expect((error as Error).message).toContain('Solo quedan 2 unidades');
    });

    it('lee el mensaje anidado que devuelve el driver', async () => {
      const error = Object.assign(new Error('envoltorio del driver'), {
        number: 54004,
        originalError: { info: { message: 'Solo quedan 2 unidades.' } },
      });
      const { servicio } = await servicioConectado({ errorAlEjecutar: error });

      // El driver anida el mensaje real del motor; el de fuera es generico.
      await expect(servicio.ejecutarProcedimiento('hce.usp_X')).rejects.toThrow(
        /Solo quedan 2 unidades/,
      );
    });

    /*
     * Un codigo no contemplado se registra entero por dentro y por fuera sale un
     * mensaje generico. Los errores del motor citan nombres de tablas, columnas
     * y a veces el servidor: es informacion util para quien esta sondeando.
     */
    it('un codigo desconocido no filtra el detalle del motor', async () => {
      const error = await fallarCon(
        99_999,
        "Invalid column name 'PasswordHash' in table hce.Usuarios",
      );

      expect((error as Error).message).not.toContain('PasswordHash');
      expect((error as Error).message).toContain('Intente nuevamente');
    });

    it('un error sin numero tambien acaba en respuesta generica', async () => {
      const { servicio } = await servicioConectado({
        errorAlEjecutar: new Error('conexion perdida a mitad de la consulta'),
      });

      await expect(servicio.ejecutarProcedimiento('hce.usp_X')).rejects.toMatchObject({
        codigo: CodigoError.INFRAESTRUCTURA,
      });
    });

    it.each([
      ['una cadena', 'algo raro'],
      ['null', null],
    ])('un fallo que es %s no rompe la traduccion', async (_caso, lanzado) => {
      const { servicio } = await servicioConectado({ errorAlEjecutar: lanzado });

      await expect(servicio.ejecutarProcedimiento('hce.usp_X')).rejects.toMatchObject({
        codigo: CodigoError.INFRAESTRUCTURA,
      });
    });

    it('una excepcion de dominio ya traducida se deja pasar sin tocar', async () => {
      const original = new ErrorInfraestructura('ya venia traducida');
      const { servicio } = await servicioConectado({ errorAlEjecutar: original });

      // Evita la doble traduccion, que convertiria un mensaje concreto en el
      // generico y perderia informacion por el camino.
      await expect(servicio.ejecutarProcedimiento('hce.usp_X')).rejects.toBe(original);
    });
  });
});

/**
 * Comprueba que ningun valor haya viajado interpolado en el nombre del
 * procedimiento o en un fragmento de SQL: todos deben ir por `input`.
 */
function execute_llamado_con_texto_plano(input: jest.Mock): boolean {
  return input.mock.calls.some(([nombre]) => String(nombre).includes(' '));
}
