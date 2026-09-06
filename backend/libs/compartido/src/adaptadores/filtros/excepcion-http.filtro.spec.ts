import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  CodigoError,
  ErrorConflicto,
  ErrorInfraestructura,
  ErrorNoEncontrado,
  ErrorStockInsuficiente,
  ErrorValidacion,
} from '../../dominio/excepciones/dominio.excepcion';

import { ExcepcionHttpFiltro, type RespuestaError } from './excepcion-http.filtro';

/**
 * Pruebas del filtro de excepciones HTTP.
 *
 * Es el ultimo punto por el que pasa todo error antes de llegar al cliente, y
 * tiene dos responsabilidades que conviene no mezclar:
 *
 *   - Traducir cada error de dominio al codigo HTTP que le corresponde. Un
 *     "stock insuficiente" es 422, no 500: la peticion estaba bien formada y el
 *     servidor funciona, simplemente la operacion no se puede hacer. La
 *     diferencia decide si el frontend muestra "no hay unidades" o "algo fallo".
 *
 *   - No filtrar informacion. Un error inesperado se registra entero por dentro
 *     y por fuera se responde con un mensaje generico. Una traza en la respuesta
 *     revela rutas del servidor, versiones y a veces cadenas de conexion.
 *
 * El registro se silencia en estas pruebas: es correcto que el filtro registre,
 * pero no que la salida de la suite se llene de errores esperados.
 */
describe('ExcepcionHttpFiltro', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /** Doble del contexto: captura el estado y el cuerpo con que se responde. */
  const contexto = (url = '/api/productos', method = 'GET') => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url, method }),
      }),
    } as unknown as ArgumentsHost;

    return {
      host,
      estado: () => status.mock.calls[0]?.[0] as number,
      cuerpo: () => json.mock.calls[0]?.[0] as RespuestaError,
    };
  };

  const capturar = (excepcion: unknown, url?: string) => {
    const c = contexto(url);
    new ExcepcionHttpFiltro().catch(excepcion, c.host);
    return c;
  };

  describe('errores de dominio', () => {
    /*
     * Esta tabla es el contrato de la API en materia de errores. Escrita asi se
     * revisa de un vistazo, y anadir un codigo de dominio nuevo sin decidir su
     * traduccion HTTP hace fallar la prueba.
     */
    it.each([
      ['validacion', new ErrorValidacion('El costo debe ser positivo'), 400],
      ['no encontrado', new ErrorNoEncontrado('Producto', 99), 404],
      ['conflicto', new ErrorConflicto('Ya existe ese lote'), 409],
      [
        'stock insuficiente',
        new ErrorStockInsuficiente('Solo quedan 2 unidades de Paracetamol'),
        422,
      ],
    ])('%s se traduce a %s', (_caso, excepcion, esperado) => {
      expect(capturar(excepcion).estado()).toBe(esperado);
    });

    it('conserva el codigo de dominio en el cuerpo', () => {
      const cuerpo = capturar(new ErrorNoEncontrado('Producto', 99)).cuerpo();

      // El frontend distingue casos por el codigo, no analizando el texto.
      expect(cuerpo.codigo).toBe(CodigoError.NO_ENCONTRADO);
    });

    it('el mensaje de negocio llega tal cual al cliente', () => {
      const cuerpo = capturar(new ErrorValidacion('El costo debe ser positivo')).cuerpo();

      // Un error de negocio SI se muestra: el usuario puede corregirlo.
      expect(cuerpo.mensaje).toContain('costo debe ser positivo');
    });

    /*
     * La excepcion de infraestructura es la excepcion a lo anterior. Su mensaje
     * interno puede citar el servidor, el procedimiento o la cadena de conexion,
     * asi que se sustituye por uno generico antes de responder.
     */
    it('el error de infraestructura no revela su mensaje interno', () => {
      const cuerpo = capturar(
        new ErrorInfraestructura('Fallo la conexion a 10.0.0.5:1433 con el usuario sa'),
      ).cuerpo();

      expect(cuerpo.mensaje).not.toContain('10.0.0.5');
      expect(cuerpo.mensaje).not.toContain('sa');
      expect(cuerpo.mensaje).toContain('error interno');
    });

    it('el error de infraestructura responde 500', () => {
      expect(capturar(new ErrorInfraestructura('lo que sea')).estado()).toBe(500);
    });

    /*
     * Cuando el error viene de un microservicio ha cruzado TCP y llega
     * serializado, sin su clase. El filtro lo reconstruye igual: si no lo
     * hiciera, todo error de negocio del microservicio seria un 500.
     */
    it.each([
      ['serializado plano', { codigo: CodigoError.NO_ENCONTRADO, mensaje: 'No existe' }],
      [
        'envuelto en error',
        { error: { codigo: CodigoError.NO_ENCONTRADO, mensaje: 'No existe' } },
      ],
    ])('reconstruye el error de dominio %s', (_forma, payload) => {
      expect(capturar(payload).estado()).toBe(404);
    });
  });

  describe('excepciones de NestJS', () => {
    it('respeta el codigo de la excepcion HTTP', () => {
      expect(capturar(new ForbiddenException('Sin permiso')).estado()).toBe(403);
    });

    it('traduce el estado a un codigo de la aplicacion', () => {
      expect(capturar(new NotFoundException('No existe')).cuerpo().codigo).toBe(
        CodigoError.NO_ENCONTRADO,
      );
    });

    /*
     * El ValidationPipe devuelve una LISTA de mensajes, uno por campo invalido.
     * Se unen en un texto legible y ademas se conservan en `detalles`, para que
     * el formulario pueda marcar cada campo por separado.
     */
    it('une los mensajes de validacion en un texto legible', () => {
      const cuerpo = capturar(
        new BadRequestException({
          message: ['el nombre es obligatorio', 'el costo debe ser positivo'],
        }),
      ).cuerpo();

      expect(cuerpo.mensaje).toBe(
        'el nombre es obligatorio | el costo debe ser positivo',
      );
    });

    it('conserva la lista completa en los detalles', () => {
      const cuerpo = capturar(
        new BadRequestException({ message: ['uno', 'otro'] }),
      ).cuerpo();

      expect(cuerpo.detalles).toEqual({ errores: ['uno', 'otro'] });
    });

    it('no anade detalles cuando el mensaje es uno solo', () => {
      expect(
        capturar(new BadRequestException('solo uno')).cuerpo().detalles,
      ).toBeUndefined();
    });

    it('acepta una excepcion cuya respuesta es una cadena', () => {
      expect(capturar(new HttpException('texto plano', 418)).cuerpo().mensaje).toBe(
        'texto plano',
      );
    });

    /*
     * El 429 del limitador trae un mensaje tecnico de la libreria. Se sustituye
     * por uno que le diga al usuario que hacer: esperar unos segundos.
     */
    it('el limite de peticiones se explica en terminos utiles', () => {
      const cuerpo = capturar(
        new HttpException('ThrottlerException: Too Many Requests', 429),
      ).cuerpo();

      expect(cuerpo.mensaje).toContain('Intente nuevamente');
      expect(cuerpo.codigo).toBe('LIMITE_PETICIONES');
    });

    it('un estado sin codigo asignado cae en infraestructura', () => {
      expect(capturar(new HttpException('rarisimo', 418)).cuerpo().codigo).toBe(
        CodigoError.INFRAESTRUCTURA,
      );
    });
  });

  describe('errores inesperados', () => {
    /*
     * Un fallo de programacion -un null que no se esperaba- no debe salir tal
     * cual. Su mensaje suele citar nombres de variables y su traza, rutas del
     * servidor. Se registra entero por dentro y se responde generico por fuera.
     */
    it.each([
      ['un Error de JavaScript', new TypeError("no se puede leer 'nombre' de undefined")],
      ['una cadena suelta', 'algo se rompio'],
      ['null', null],
    ])('responde 500 generico ante %s', (_caso, excepcion) => {
      const c = capturar(excepcion);

      expect(c.estado()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(c.cuerpo().mensaje).toBe(
        'Ocurrio un error interno. El equipo tecnico ha sido notificado.',
      );
    });

    it('no filtra el mensaje original del fallo', () => {
      const cuerpo = capturar(
        new TypeError("no se puede leer 'nombre' de undefined"),
      ).cuerpo();

      expect(cuerpo.mensaje).not.toContain('undefined');
    });

    it('la respuesta nunca lleva la traza de la pila', () => {
      const cuerpo = capturar(new Error('fallo')).cuerpo();

      expect(cuerpo).not.toHaveProperty('stack');
      expect(JSON.stringify(cuerpo)).not.toContain('.ts:');
    });
  });

  describe('forma de la respuesta', () => {
    /*
     * Todos los errores comparten forma. Es lo que permite que el cliente tenga
     * un unico manejador en lugar de adivinar la estructura segun el endpoint.
     */
    it('siempre tiene la misma estructura', () => {
      const cuerpo = capturar(
        new ErrorNoEncontrado('Producto', 1),
        '/api/productos/1',
      ).cuerpo();

      expect(cuerpo).toMatchObject({
        exito: false,
        codigo: expect.any(String) as string,
        mensaje: expect.any(String) as string,
        ruta: '/api/productos/1',
        marcaTiempo: expect.any(String) as string,
      });
    });

    it('incluye la ruta, para poder cruzarla con los registros', () => {
      expect(capturar(new Error('x'), '/api/ventas').cuerpo().ruta).toBe('/api/ventas');
    });

    it('la marca de tiempo va en formato ISO', () => {
      expect(capturar(new Error('x')).cuerpo().marcaTiempo).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
    });
  });
});
