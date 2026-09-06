import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';

import { CLIENTES_MICROSERVICIO, ExcepcionHttpFiltro } from '@hce/compartido';

import { AuthControlador } from '../../adaptadores/controladores/auth.controlador';
import { ComprasControlador } from '../../adaptadores/controladores/compras.controlador';
import { KardexControlador } from '../../adaptadores/controladores/kardex.controlador';
import { ProductosControlador } from '../../adaptadores/controladores/productos.controlador';
import { SaludControlador } from '../../adaptadores/controladores/salud.controlador';
import { VentasControlador } from '../../adaptadores/controladores/ventas.controlador';
import { JwtEstrategia } from '../../adaptadores/seguridad/estrategias/jwt.estrategia';
import { JwtAuthGuardia } from '../../adaptadores/seguridad/guardias/jwt-auth.guardia';
import { RolesGuardia } from '../../adaptadores/seguridad/guardias/roles.guardia';

import { AppModule } from './app.module';

/**
 * Pruebas de la raiz de composicion del API Gateway.
 *
 * A diferencia de los tres microservicios, aqui no hay casos de uso que cablear:
 * lo que se compone es la CADENA DE SEGURIDAD y las conexiones salientes.
 *
 * El orden de los guardias globales no es cosmetico. NestJS los ejecuta en el
 * orden en que se registran, y ese orden es una decision:
 *
 *   1. Throttler primero, porque rechaza el exceso de peticiones ANTES de
 *      gastar CPU verificando firmas. Ponerlo al final convertiria el propio
 *      limitador en el amplificador de un ataque: cada peticion basura costaria
 *      una verificacion de JWT completa.
 *   2. JWT despues: autentica.
 *   3. Roles al final: autoriza, y necesita la identidad que puso el anterior.
 *      Invertir estos dos dejaria al guardia de roles sin usuario en la
 *      peticion, siempre.
 *
 * Nada de esto lo comprueba el compilador: es el orden de un array.
 */
describe('AppModule (raiz de composicion del gateway)', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'secreto-de-prueba-suficientemente-largo';

    // Los clientes TCP no abren conexion hasta el primer mensaje, asi que el
    // modulo compila sin que los microservicios esten levantados.
    modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await modulo.close();
  });

  it('el modulo se construye entero sin dependencias sin resolver', () => {
    expect(modulo).toBeDefined();
  });

  describe('controladores', () => {
    it.each([
      ['salud', SaludControlador],
      ['autenticacion', AuthControlador],
      ['productos', ProductosControlador],
      ['compras', ComprasControlador],
      ['ventas', VentasControlador],
      ['kardex', KardexControlador],
    ])('el controlador de %s esta registrado', (_caso, Clase) => {
      expect(modulo.get(Clase)).toBeInstanceOf(Clase);
    });
  });

  describe('cadena de seguridad', () => {
    /*
     * El contenedor de NestJS resuelve un token a un unico valor, asi que no
     * sirve para ver los tres guardias registrados bajo APP_GUARD. Se leen los
     * metadatos del decorador @Module, que es LITERALMENTE lo que fija el orden
     * de ejecucion: el orden del array de proveedores.
     */
    interface ProveedorDeclarado {
      provide?: unknown;
      useClass?: new (...argumentos: never[]) => unknown;
    }

    const declarados = (token: unknown): ProveedorDeclarado[] => {
      const proveedores =
        (Reflect.getMetadata('providers', AppModule) as unknown[] | undefined) ?? [];

      return proveedores.filter(
        (p): p is ProveedorDeclarado =>
          typeof p === 'object' &&
          p !== null &&
          (p as ProveedorDeclarado).provide === token,
      );
    };

    it('hay exactamente tres guardias globales', () => {
      // Uno de mas o de menos cambia quien puede hacer que en toda la API.
      expect(declarados(APP_GUARD)).toHaveLength(3);
    });

    it('se ejecutan en el orden limitador, autenticacion, autorizacion', () => {
      expect(declarados(APP_GUARD).map((p) => p.useClass)).toEqual([
        ThrottlerGuard,
        JwtAuthGuardia,
        RolesGuardia,
      ]);
    });

    it('el limitador va primero: rechaza antes de verificar ninguna firma', () => {
      // Al reves, cada peticion basura costaria una verificacion de JWT y el
      // limitador amplificaria el ataque en vez de contenerlo.
      expect(declarados(APP_GUARD)[0]?.useClass).toBe(ThrottlerGuard);
    });

    it('la autorizacion va despues de la autenticacion', () => {
      const clases = declarados(APP_GUARD).map((p) => p.useClass);

      // Sin identidad no hay nada que autorizar: el guardia de roles necesita
      // el usuario que deja el de JWT en la peticion.
      expect(clases.indexOf(JwtAuthGuardia)).toBeLessThan(clases.indexOf(RolesGuardia));
    });

    /*
     * Que los tres guardias se puedan CONSTRUIR ya lo demuestra que el modulo
     * compile: Nest instancia los proveedores de APP_GUARD al compilar, y una
     * dependencia sin resolver -el Reflector, por ejemplo- haria fallar el
     * `beforeAll` entero. No se comprueban por separado porque el contenedor no
     * los expone por su clase, solo bajo el token compartido.
     */
    it('la estrategia de validacion del token esta registrada', () => {
      expect(modulo.get(JwtEstrategia)).toBeInstanceOf(JwtEstrategia);
    });

    it('el filtro de excepciones esta registrado globalmente', () => {
      expect(declarados(APP_FILTER).map((p) => p.useClass)).toEqual([
        ExcepcionHttpFiltro,
      ]);
    });
  });

  describe('clientes de microservicio', () => {
    /*
     * Un solo cliente por microservicio, resuelto por token. Es lo que permite
     * que los controladores reciban su cliente sin conocer host ni puerto: el
     * destino se decide aqui, y en Docker viene del entorno.
     */
    it.each([
      ['autenticacion', CLIENTES_MICROSERVICIO.AUTH],
      ['catalogo', CLIENTES_MICROSERVICIO.CATALOGO],
      ['inventario', CLIENTES_MICROSERVICIO.INVENTARIO],
    ])('el cliente de %s esta disponible', (_caso, token) => {
      expect(modulo.get<{ send: unknown }>(token).send).toBeDefined();
    });

    it('los tres tokens son distintos', () => {
      const tokens = Object.values(CLIENTES_MICROSERVICIO);

      // Dos tokens iguales harian que dos controladores hablaran con el mismo
      // servicio, y las llamadas del otro nunca llegarian a su destino.
      expect(new Set(tokens).size).toBe(tokens.length);
    });
  });
});
