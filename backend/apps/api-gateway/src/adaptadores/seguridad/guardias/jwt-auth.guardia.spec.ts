import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { JwtAuthGuardia } from './jwt-auth.guardia';

/**
 * Controlador de mentira. El guardia solo lo usa como clave para buscar
 * metadata, asi que basta con que sea una clase real y distinguible.
 */
class ControladorDePrueba {
  manejador(): string {
    return 'sin uso';
  }
}

/**
 * Pruebas del guardia de autenticacion.
 *
 * Hace dos cosas: dejar pasar los endpoints marcados como publicos -el login,
 * sin ir mas lejos, que no puede exigir sesion- y traducir el fallo de Passport
 * a un mensaje que el usuario entienda.
 *
 * La segunda parte tiene mas fondo del que parece. Distinguir "tu sesion
 * caduco" de "no hay token" cambia lo que hace el frontend: en el primer caso
 * conviene avisar y redirigir al login; en el segundo, algo esta mal en la
 * peticion. Pero el mensaje nunca debe decir por que un token es invalido mas
 * alla de eso, para no dar pistas a quien esta probando.
 *
 * `canActivate` con un endpoint privado delega en `AuthGuard('jwt')` de Passport,
 * cuya ejecucion real necesita la estrategia registrada en un modulo de Nest;
 * eso lo cubren las pruebas de extremo a extremo. Aqui se comprueba la logica
 * propia del guardia.
 */
describe('JwtAuthGuardia', () => {
  const contexto = (): ExecutionContext =>
    ({
      getHandler: () => ControladorDePrueba.prototype.manejador,
      getClass: () => ControladorDePrueba,
    }) as unknown as ExecutionContext;

  const reflector = (esPublico: boolean | undefined): Reflector =>
    ({ getAllAndOverride: jest.fn().mockReturnValue(esPublico) }) as unknown as Reflector;

  describe('endpoints publicos', () => {
    it('deja pasar sin token el endpoint marcado como publico', () => {
      const guardia = new JwtAuthGuardia(reflector(true));

      expect(guardia.canActivate(contexto())).toBe(true);
    });

    it('consulta la marca de publico en el metodo y en la clase', () => {
      const espia = reflector(true);

      expect(new JwtAuthGuardia(espia).canActivate(contexto())).toBe(true);
      expect(espia.getAllAndOverride).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleRequest', () => {
    const guardia = new JwtAuthGuardia(reflector(false));
    const usuario = { id: 1, username: 'admin' };

    it('devuelve el usuario cuando la validacion fue bien', () => {
      expect(guardia.handleRequest(null, usuario, undefined)).toBe(usuario);
    });

    /*
     * Un token caducado merece su propio mensaje porque implica una accion
     * distinta del usuario: volver a entrar. Sin esta distincion, una sesion
     * vencida se ve igual que una peticion mal formada y el usuario no sabe que
     * hacer.
     */
    it('avisa de forma especifica cuando el token expiro', () => {
      expect(() =>
        guardia.handleRequest<unknown>(null, null, { name: 'TokenExpiredError' }),
      ).toThrow(/expiro/i);
    });

    it.each([
      ['no hay usuario', null, undefined],
      ['la firma no valida', null, { name: 'JsonWebTokenError' }],
      ['passport devolvio un error', new Error('fallo'), null],
    ])('rechaza con 401 cuando %s', (_caso, error, info) => {
      expect(() => guardia.handleRequest<unknown>(error, null, info)).toThrow(
        UnauthorizedException,
      );
    });

    /*
     * Todo lo que no sea una expiracion comparte un unico mensaje generico. Es
     * deliberado: detallar si la firma no cuadra, si el emisor es otro o si el
     * token esta mal formado le iria diciendo a quien prueba que parte acerto.
     */
    it('no revela por que un token es invalido', () => {
      try {
        guardia.handleRequest<unknown>(null, null, { name: 'JsonWebTokenError' });
        throw new Error('Se esperaba que el guardia rechazara la peticion.');
      } catch (error) {
        const mensaje = (error as UnauthorizedException).message;
        expect(mensaje).toBe('Token de acceso ausente o invalido.');
        expect(mensaje).not.toMatch(/firma|secreto|algoritmo|emisor/i);
      }
    });

    it('un usuario ausente no pasa aunque no haya error', () => {
      // `undefined` como usuario es el caso de un token bien formado cuya
      // validacion no devolvio identidad. No debe convertirse en sesion valida.
      expect(() => guardia.handleRequest<unknown>(null, undefined, undefined)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
