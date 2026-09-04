import {
  CodigoError,
  ErrorConflicto,
  ErrorInfraestructura,
  ErrorNoAutorizado,
  ErrorNoEncontrado,
  ErrorProhibido,
  ErrorStockInsuficiente,
  ErrorValidacion,
  ExcepcionDominio,
} from './dominio.excepcion';

/**
 * Pruebas de las excepciones de dominio.
 *
 * Lo que se verifica no es que "lancen": es que el codigo sobreviva al viaje de
 * ida y vuelta por el transporte RPC. Ese es el mecanismo que permite al API
 * Gateway devolver 422 en lugar de 500 cuando el inventario rechaza una venta,
 * y si se rompe el sintoma es sutil: todo sigue funcionando, pero cada error de
 * negocio se convierte en un error interno.
 */
describe('Excepciones de dominio', () => {
  describe('serializacion y reconstruccion', () => {
    it('conserva el codigo al serializar', () => {
      const error = new ErrorStockInsuficiente('Sin existencias');

      expect(error.serializar()).toMatchObject({
        codigo: CodigoError.STOCK_INSUFICIENTE,
        mensaje: 'Sin existencias',
      });
    });

    it('reconstruye la excepcion desde su forma serializada', () => {
      const original = new ErrorConflicto('Duplicado', { campo: 'nroLote' });

      const reconstruida = ExcepcionDominio.desdeSerializado(original.serializar());

      expect(reconstruida).toBeInstanceOf(ExcepcionDominio);
      expect(reconstruida?.codigo).toBe(CodigoError.CONFLICTO);
      expect(reconstruida?.message).toBe('Duplicado');
      expect(reconstruida?.detalles).toEqual({ campo: 'nroLote' });
    });

    it('sobrevive a un viaje completo de ida y vuelta por JSON', () => {
      // Es lo que ocurre de verdad al cruzar el transporte TCP entre servicios.
      const original = new ErrorStockInsuficiente('Solicitado 10 / Disponible 5');

      const viajado = JSON.parse(JSON.stringify(original.serializar())) as unknown;
      const reconstruida = ExcepcionDominio.desdeSerializado(viajado);

      expect(reconstruida?.codigo).toBe(CodigoError.STOCK_INSUFICIENTE);
      expect(reconstruida?.message).toContain('Disponible 5');
    });

    it('devuelve null ante un payload que no es una excepcion de dominio', () => {
      expect(ExcepcionDominio.desdeSerializado(null)).toBeNull();
      expect(ExcepcionDominio.desdeSerializado('texto suelto')).toBeNull();
      expect(ExcepcionDominio.desdeSerializado({ mensaje: 'sin codigo' })).toBeNull();
      expect(
        ExcepcionDominio.desdeSerializado({ codigo: 'INVENTADO', mensaje: 'x' }),
      ).toBeNull();
    });

    it('rechaza un payload cuyo mensaje no es una cadena', () => {
      expect(
        ExcepcionDominio.desdeSerializado({
          codigo: CodigoError.VALIDACION,
          mensaje: 42,
        }),
      ).toBeNull();
    });
  });

  describe('codigos de cada tipo', () => {
    it.each([
      [new ErrorValidacion('x'), CodigoError.VALIDACION],
      [new ErrorNoEncontrado('Producto', 1), CodigoError.NO_ENCONTRADO],
      [new ErrorConflicto('x'), CodigoError.CONFLICTO],
      [new ErrorStockInsuficiente('x'), CodigoError.STOCK_INSUFICIENTE],
      [new ErrorNoAutorizado(), CodigoError.NO_AUTORIZADO],
      [new ErrorProhibido(), CodigoError.PROHIBIDO],
      [new ErrorInfraestructura('x'), CodigoError.INFRAESTRUCTURA],
    ])('%s expone su codigo', (error, codigoEsperado) => {
      expect(error.codigo).toBe(codigoEsperado);
    });

    it('todas siguen siendo instancias de Error', () => {
      expect(new ErrorValidacion('x')).toBeInstanceOf(Error);
      expect(new ErrorStockInsuficiente('x')).toBeInstanceOf(ExcepcionDominio);
    });

    it('conserva el nombre de la subclase', () => {
      expect(new ErrorStockInsuficiente('x').name).toBe('ErrorStockInsuficiente');
    });
  });

  describe('ErrorNoEncontrado', () => {
    it('incluye el identificador en el mensaje cuando se indica', () => {
      const error = new ErrorNoEncontrado('Producto', 42);

      expect(error.message).toContain('42');
      expect(error.detalles).toEqual({ recurso: 'Producto', identificador: 42 });
    });

    it('omite el identificador cuando no se indica', () => {
      const error = new ErrorNoEncontrado('Producto');

      expect(error.message).toBe('Producto no encontrado.');
      expect(error.detalles).toBeUndefined();
    });
  });

  describe('mensajes por defecto', () => {
    it('ErrorNoAutorizado no revela detalles de la credencial', () => {
      expect(new ErrorNoAutorizado().message).toBe('Credenciales invalidas.');
    });

    it('ErrorProhibido explica que falta permiso, no que falte autenticacion', () => {
      expect(new ErrorProhibido().message).toContain('permisos');
    });
  });
});
