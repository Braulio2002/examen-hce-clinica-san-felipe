import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import type { UsuarioAutenticado } from '../estrategias/jwt.estrategia';

import { CLAVE_PUBLICO, Publico } from './publico.decorador';
import { CLAVE_ROLES, Roles } from './roles.decorador';
import { UsuarioActual } from './usuario-actual.decorador';

/**
 * Pruebas de los decoradores de seguridad del gateway.
 *
 * Un decorador de NestJS es, por dentro, una funcion que escribe metadata o que
 * lee del contexto. Probarlos exige acceder a esa funcion, que el framework
 * envuelve, y por eso el andamiaje de este archivo es algo mas aparatoso de lo
 * habitual.
 *
 * Merece la pena por `@UsuarioActual()`: es lo que entrega la identidad a cada
 * controlador, y de ahi sale el `usuarioApp` que queda escrito en la auditoria
 * de la base. Si devolviera el usuario equivocado, la trazabilidad de quien
 * hizo cada movimiento seria falsa sin que nada fallara.
 */
describe('Decoradores de seguridad', () => {
  describe('UsuarioActual', () => {
    type FabricaParametro = (
      campo: keyof UsuarioAutenticado | undefined,
      contexto: ExecutionContext,
    ) => unknown;

    /*
     * `createParamDecorator` no expone su funcion de extraccion: la guarda en
     * los metadatos del parametro donde se aplica. Se aplica sobre un metodo de
     * mentira y se lee de ahi, que es la via que da NestJS para esto. Es la
     * unica forma de ejercitar la funcion sin levantar una aplicacion HTTP.
     */
    const obtenerFuncion = (): FabricaParametro => {
      class ControladorDePrueba {
        manejador(@UsuarioActual() _usuario: unknown): void {
          // Solo existe para que el decorador escriba sus metadatos.
        }
      }

      const metadatos = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        ControladorDePrueba,
        'manejador',
      ) as Record<string, { factory?: FabricaParametro }>;

      const entrada = Object.values(metadatos).find((m) => m.factory);
      if (!entrada?.factory) {
        throw new Error('No se pudo recuperar la fabrica del decorador.');
      }
      return entrada.factory;
    };

    const usuario: UsuarioAutenticado = {
      id: 1,
      username: 'farmacia',
      nombre: 'Responsable de Farmacia',
      rol: 'FARMACIA',
      expiraEn: new Date('2026-09-30T00:00:00Z'),
    };

    const contexto = (peticion: { user?: UsuarioAutenticado }): ExecutionContext =>
      ({
        switchToHttp: () => ({ getRequest: () => peticion }),
      }) as unknown as ExecutionContext;

    it('devuelve el usuario completo cuando no se pide un campo', () => {
      const funcion = obtenerFuncion();

      expect(funcion(undefined, contexto({ user: usuario }))).toBe(usuario);
    });

    it('devuelve solo el campo pedido', () => {
      const funcion = obtenerFuncion();

      // `@UsuarioActual('username')` evita que el controlador reciba la
      // identidad entera cuando solo necesita el nombre.
      expect(funcion('username', contexto({ user: usuario }))).toBe('farmacia');
    });

    it('devuelve el rol cuando se pide', () => {
      expect(obtenerFuncion()('rol', contexto({ user: usuario }))).toBe('FARMACIA');
    });

    /*
     * Sin usuario devuelve undefined en lugar de romper. Solo puede ocurrir en
     * una ruta publica que use el decorador por descuido; el controlador vera un
     * undefined explicito, que es mas facil de diagnosticar que una excepcion
     * dentro del framework.
     */
    it('devuelve undefined si la peticion no trae usuario', () => {
      expect(obtenerFuncion()(undefined, contexto({}))).toBeUndefined();
    });

    it('tampoco rompe al pedir un campo sin usuario', () => {
      expect(obtenerFuncion()('username', contexto({}))).toBeUndefined();
    });
  });

  describe('Publico', () => {
    it('marca el manejador como accesible sin token', () => {
      class Controlador {
        @Publico()
        login(): string {
          return 'ok';
        }
      }

      const marca: unknown = Reflect.getMetadata(
        CLAVE_PUBLICO,
        Controlador.prototype.login,
      );
      expect(marca).toBe(true);
    });

    it('un manejador sin la marca no queda expuesto', () => {
      class Controlador {
        privado(): string {
          return 'ok';
        }
      }

      // La ausencia de metadata es lo que hace que el guardia exija token: el
      // sistema es cerrado por defecto y se abre endpoint a endpoint.
      const marca: unknown = Reflect.getMetadata(
        CLAVE_PUBLICO,
        Controlador.prototype.privado,
      );
      expect(marca).toBeUndefined();
    });
  });

  describe('Roles', () => {
    it('guarda los roles exigidos por el manejador', () => {
      class Controlador {
        @Roles('ADMIN', 'FARMACIA')
        registrar(): string {
          return 'ok';
        }
      }

      const roles: unknown = Reflect.getMetadata(
        CLAVE_ROLES,
        Controlador.prototype.registrar,
      );
      expect(roles).toEqual(['ADMIN', 'FARMACIA']);
    });

    it('admite un unico rol', () => {
      class Controlador {
        @Roles('ADMIN')
        eliminar(): string {
          return 'ok';
        }
      }

      expect(Reflect.getMetadata(CLAVE_ROLES, Controlador.prototype.eliminar)).toEqual([
        'ADMIN',
      ]);
    });

    it('sin el decorador no hay restriccion de rol', () => {
      class Controlador {
        listar(): string {
          return 'ok';
        }
      }

      // Un endpoint sin @Roles() sigue exigiendo sesion; lo que no exige es un
      // rol concreto. Los dos guardias son independientes a proposito.
      expect(
        Reflect.getMetadata(CLAVE_ROLES, Controlador.prototype.listar),
      ).toBeUndefined();
    });
  });
});
