import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { Rol } from '../decoradores/roles.decorador';
import type { UsuarioAutenticado } from '../estrategias/jwt.estrategia';

import { RolesGuardia } from './roles.guardia';

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
 * Pruebas del guardia de roles.
 *
 * Es la frontera de autorizacion del sistema: decide si un usuario ya
 * autenticado puede ejecutar una operacion concreta. Un fallo aqui no rompe
 * nada visible -la aplicacion sigue funcionando- pero permite que un usuario de
 * CONSULTA registre ventas. Es la clase de defecto que no aparece en una demo y
 * se descubre en una auditoria.
 *
 * Por eso las pruebas cubren tambien los caminos "raros": endpoint sin roles
 * declarados, lista de roles vacia, peticion sin usuario. Cada uno de ellos es
 * una forma distinta de acabar dejando pasar a quien no debe.
 */
describe('RolesGuardia', () => {
  const usuario = (rol: Rol): UsuarioAutenticado => ({
    id: 1,
    username: 'usuario',
    nombre: 'Usuario de Prueba',
    rol,
    expiraEn: new Date('2026-09-30T00:00:00Z'),
  });

  /**
   * Doble del contexto de NestJS. Solo se implementa lo que el guardia usa:
   * el manejador, la clase y la peticion HTTP.
   */
  const contexto = (peticion: { user?: UsuarioAutenticado }): ExecutionContext =>
    ({
      getHandler: () => ControladorDePrueba.prototype.manejador,
      getClass: () => ControladorDePrueba,
      switchToHttp: () => ({ getRequest: () => peticion }),
    }) as unknown as ExecutionContext;

  const reflector = (roles: Rol[] | undefined): Reflector =>
    ({ getAllAndOverride: jest.fn().mockReturnValue(roles) }) as unknown as Reflector;

  describe('endpoints sin restriccion de rol', () => {
    /*
     * Un endpoint sin @Roles() no impone rol alguno. La autenticacion ya la
     * exigio el guardia de JWT antes; este solo anade la capa de autorizacion
     * cuando el endpoint la pide.
     */
    it('deja pasar si el endpoint no declara roles', () => {
      const guardia = new RolesGuardia(reflector(undefined));

      expect(guardia.canActivate(contexto({ user: usuario('CONSULTA') }))).toBe(true);
    });

    it('deja pasar si la lista de roles esta vacia', () => {
      const guardia = new RolesGuardia(reflector([]));

      expect(guardia.canActivate(contexto({ user: usuario('CONSULTA') }))).toBe(true);
    });
  });

  describe('endpoints restringidos', () => {
    it('deja pasar al usuario con el rol exigido', () => {
      const guardia = new RolesGuardia(reflector(['ADMIN']));

      expect(guardia.canActivate(contexto({ user: usuario('ADMIN') }))).toBe(true);
    });

    it('deja pasar si el usuario tiene uno de los roles admitidos', () => {
      const guardia = new RolesGuardia(reflector(['ADMIN', 'FARMACIA']));

      expect(guardia.canActivate(contexto({ user: usuario('FARMACIA') }))).toBe(true);
    });

    it('bloquea al usuario con un rol que no basta', () => {
      const guardia = new RolesGuardia(reflector(['ADMIN', 'FARMACIA']));

      expect(() => guardia.canActivate(contexto({ user: usuario('CONSULTA') }))).toThrow(
        ForbiddenException,
      );
    });

    /*
     * Es 403 y no 401, y la diferencia importa: el usuario esta correctamente
     * autenticado, lo que le falta es permiso. Un 401 le diria al cliente que
     * vuelva a iniciar sesion, cuando eso no cambiaria nada.
     */
    it('el rechazo es 403 (autenticado pero sin permiso), no 401', () => {
      const guardia = new RolesGuardia(reflector(['ADMIN']));

      try {
        guardia.canActivate(contexto({ user: usuario('CONSULTA') }));
        throw new Error('Se esperaba que el guardia bloqueara la peticion.');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getStatus()).toBe(403);
      }
    });

    it('el mensaje dice que roles harian falta', () => {
      const guardia = new RolesGuardia(reflector(['ADMIN', 'FARMACIA']));

      expect(() => guardia.canActivate(contexto({ user: usuario('CONSULTA') }))).toThrow(
        /ADMIN, FARMACIA/,
      );
    });
  });

  /*
   * Este es el caso que decide si el guardia falla de forma segura.
   *
   * Si por un error de configuracion el guardia de roles se ejecutara sin que
   * el de JWT hubiera puesto el usuario en la peticion, la opcion comoda seria
   * dejar pasar. Aqui se bloquea: sin identidad no hay autorizacion posible.
   */
  it('bloquea si la peticion no trae usuario: sin identidad no se autoriza', () => {
    const guardia = new RolesGuardia(reflector(['ADMIN']));

    expect(() => guardia.canActivate(contexto({}))).toThrow(ForbiddenException);
  });

  it('consulta la metadata tanto del metodo como de la clase', () => {
    const espia = reflector(['ADMIN']);
    const guardia = new RolesGuardia(espia);

    guardia.canActivate(contexto({ user: usuario('ADMIN') }));

    // Permite declarar @Roles() en el controlador entero y afinarlo por metodo.
    const argumentos = (espia.getAllAndOverride as jest.Mock).mock.calls[0];
    expect(argumentos?.[1]).toHaveLength(2);
  });
});
