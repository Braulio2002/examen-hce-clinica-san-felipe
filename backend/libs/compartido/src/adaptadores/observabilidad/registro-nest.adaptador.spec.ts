import { Logger } from '@nestjs/common';

import { ejecutarConCorrelacion } from './contexto-correlacion';
import { RegistroNest } from './registro-nest.adaptador';

/**
 * Pruebas del adaptador de registro.
 *
 * Es la implementacion del puerto `RegistroPuerto` que usan los casos de uso y
 * los decoradores de las pasarelas. Su interes esta en el detalle que lo
 * justifica: antepone a cada linea el identificador de correlacion de la
 * peticion en curso.
 *
 * Sin eso, los registros de los cuatro servicios serian cuatro listas
 * independientes ordenadas por hora, y reconstruir una operacion concreta
 * -sobre todo con varias en paralelo- seria adivinar. Con eso, un `grep` del
 * identificador devuelve la operacion entera de punta a punta.
 */
describe('RegistroNest', () => {
  const espias = () => ({
    depurar: jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
    informar: jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    advertir: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    fallar: jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('niveles', () => {
    /*
     * Los cuatro niveles del puerto se corresponden con los de NestJS. Cruzarlos
     * -mandar un aviso al canal de error, por ejemplo- estropea el filtrado por
     * nivel, que es lo que hace utilizable un registro en produccion.
     */
    it('depurar usa el canal de depuracion', () => {
      const { depurar } = espias();

      new RegistroNest('Prueba').depurar('mensaje');

      expect(depurar).toHaveBeenCalledWith('mensaje');
    });

    it('informar usa el canal informativo', () => {
      const { informar } = espias();

      new RegistroNest('Prueba').informar('mensaje');

      expect(informar).toHaveBeenCalledWith('mensaje');
    });

    it('advertir usa el canal de aviso', () => {
      const { advertir } = espias();

      new RegistroNest('Prueba').advertir('mensaje');

      expect(advertir).toHaveBeenCalledWith('mensaje');
    });

    it('error usa el canal de error', () => {
      const { fallar } = espias();

      new RegistroNest('Prueba').error('mensaje');

      expect(fallar).toHaveBeenCalledWith('mensaje', undefined);
    });

    it('el error puede llevar la traza como segundo argumento', () => {
      const { fallar } = espias();

      new RegistroNest('Prueba').error('fallo', 'Error: algo\n  at x');

      // La traza va aparte y no dentro del mensaje: asi el recolector de
      // registros la puede tratar como campo propio.
      expect(fallar).toHaveBeenCalledWith('fallo', 'Error: algo\n  at x');
    });
  });

  describe('correlacion', () => {
    it('antepone el identificador de la peticion en curso', () => {
      const { informar } = espias();

      ejecutarConCorrelacion('traza-123', () => {
        new RegistroNest('Prueba').informar('Producto registrado.');
      });

      expect(informar).toHaveBeenCalledWith('[traza-123] Producto registrado.');
    });

    it('lo antepone en los cuatro niveles', () => {
      const { depurar, informar, advertir, fallar } = espias();

      ejecutarConCorrelacion('traza-123', () => {
        const registro = new RegistroNest('Prueba');
        registro.depurar('a');
        registro.informar('b');
        registro.advertir('c');
        registro.error('d');
      });

      // Un nivel sin identificador seria justo la linea que falta al investigar.
      expect(depurar).toHaveBeenCalledWith('[traza-123] a');
      expect(informar).toHaveBeenCalledWith('[traza-123] b');
      expect(advertir).toHaveBeenCalledWith('[traza-123] c');
      expect(fallar).toHaveBeenCalledWith('[traza-123] d', undefined);
    });

    /*
     * Fuera de una peticion -en el arranque, por ejemplo- no hay identificador
     * que anteponer. El mensaje sale limpio en lugar de con un prefijo vacio
     * que solo aportaria ruido.
     */
    it('deja el mensaje limpio cuando no hay peticion en curso', () => {
      const { informar } = espias();

      new RegistroNest('Prueba').informar('Servicio iniciado.');

      expect(informar).toHaveBeenCalledWith('Servicio iniciado.');
    });
  });

  describe('contexto', () => {
    it('cada instancia registra bajo el nombre que se le da', () => {
      const { informar } = espias();

      new RegistroNest('ProductoPasarela').informar('x');

      // El contexto es lo que permite filtrar por componente: `[ProductoPasarela]`
      // en la salida de NestJS. Lo pone el Logger, no el mensaje.
      const logger = (
        new RegistroNest('ProductoPasarela') as unknown as {
          logger: { context?: string };
        }
      ).logger;
      expect(logger.context).toBe('ProductoPasarela');
      expect(informar).toHaveBeenCalledTimes(1);
    });
  });
});
