import { Test, type TestingModule } from '@nestjs/testing';

import { MssqlService } from '@hce/compartido';

import {
  CATALOGO_FACHADA,
  ProductoControlador,
} from '../../adaptadores/controladores/producto.controlador';
import {
  ProductoPasarelaConReintentos,
  ProductoPasarelaTrazada,
} from '../../adaptadores/pasarelas/producto.pasarela-decoradores';
import { CatalogoFachada } from '../../aplicacion/fachadas/catalogo.fachada';
import {
  ACTUALIZAR_PRODUCTO_PUERTO,
  ELIMINAR_PRODUCTO_PUERTO,
  LISTAR_PRODUCTOS_PUERTO,
  OBTENER_PRODUCTO_PUERTO,
  REGISTRAR_PRODUCTO_PUERTO,
} from '../../aplicacion/puertos/entrada/catalogo.puertos';
import { PRODUCTO_REPOSITORIO } from '../../aplicacion/puertos/salida/producto.repositorio';

import { CatalogoModule } from './catalogo.module';

/**
 * Pruebas de la raiz de composicion del microservicio de Catalogo.
 *
 * De todas las pruebas del proyecto, esta es la que mas dice sobre la
 * arquitectura, y conviene explicar por que.
 *
 * En Clean Architecture, los casos de uso son clases planas: no llevan
 * `@Injectable()` ni saben que existe NestJS. Esa es la propiedad que hace que
 * la arquitectura sea real y no decorativa. Pero tiene un precio: si nadie los
 * declara, NestJS no puede adivinar como construirlos. Todo el grafo se arma a
 * mano en este modulo con `useFactory`.
 *
 * Y ese cableado manual NO lo comprueba el compilador. Un `inject` en distinto
 * orden que los parametros de la fabrica pasa la compilacion perfectamente y
 * entrega el repositorio donde iba el registro. Falla al arrancar, o peor: no
 * falla y se comporta raro.
 *
 * Lo que hace esta prueba es levantar el modulo de verdad -con el servicio de
 * base sustituido, porque no hay SQL Server aqui- y comprobar que cada pieza se
 * construye y que la cadena de decoradores queda apilada en el orden previsto.
 * Es la unica forma de verificar el composition root sin desplegar.
 */
describe('CatalogoModule (raiz de composicion)', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [CatalogoModule] })
      // Se sustituye el unico punto que necesitaria una base real. Todo lo
      // demas -decoradores, casos de uso, fachada- se construye de verdad.
      .overrideProvider(MssqlService)
      .useValue({ consultar: jest.fn(), ejecutarProcedimiento: jest.fn() })
      .compile();
  });

  afterAll(async () => {
    await modulo.close();
  });

  it('el modulo se construye entero sin dependencias sin resolver', () => {
    expect(modulo).toBeDefined();
  });

  it('registra el controlador RPC', () => {
    expect(modulo.get(ProductoControlador)).toBeInstanceOf(ProductoControlador);
  });

  describe('cadena de decoradores del repositorio', () => {
    /*
     * El orden es Trazado -> Reintentos -> Pasarela SQL, y esta escrito asi a
     * proposito: el trazado envuelve a los reintentos, de modo que el tiempo
     * medido incluye las esperas entre intentos, que es lo que de verdad
     * percibe el usuario. Invertirlo mediria un solo intento y ocultaria
     * justamente la latencia que interesa detectar.
     */
    it('la capa externa es el trazado', () => {
      expect(modulo.get(PRODUCTO_REPOSITORIO)).toBeInstanceOf(ProductoPasarelaTrazada);
    });

    it('debajo del trazado estan los reintentos', () => {
      const trazada = modulo.get<ProductoPasarelaTrazada>(PRODUCTO_REPOSITORIO);
      const envuelto = (trazada as unknown as { interno: unknown }).interno;

      expect(envuelto).toBeInstanceOf(ProductoPasarelaConReintentos);
    });
  });

  describe('casos de uso', () => {
    /*
     * Se resuelven por Symbol y no por clase. Es la consecuencia directa de que
     * no lleven `@Injectable()`: el token es el puerto, no la implementacion, y
     * eso es lo que permite sustituir una por otra sin tocar quien la usa.
     */
    it.each([
      ['registrar', REGISTRAR_PRODUCTO_PUERTO],
      ['actualizar', ACTUALIZAR_PRODUCTO_PUERTO],
      ['listar', LISTAR_PRODUCTOS_PUERTO],
      ['obtener', OBTENER_PRODUCTO_PUERTO],
      ['eliminar', ELIMINAR_PRODUCTO_PUERTO],
    ])('el puerto de %s esta satisfecho y es ejecutable', (_caso, token) => {
      const casoUso = modulo.get<{ ejecutar: unknown }>(token);

      expect(typeof casoUso.ejecutar).toBe('function');
    });

    it('los cinco casos de uso son instancias distintas', () => {
      const tokens = [
        REGISTRAR_PRODUCTO_PUERTO,
        ACTUALIZAR_PRODUCTO_PUERTO,
        LISTAR_PRODUCTOS_PUERTO,
        OBTENER_PRODUCTO_PUERTO,
        ELIMINAR_PRODUCTO_PUERTO,
      ];

      // Si dos tokens resolvieran al mismo objeto, seria que una fabrica esta
      // construyendo el caso de uso equivocado.
      expect(new Set(tokens.map((t) => modulo.get(t))).size).toBe(5);
    });

    it('todos comparten el mismo repositorio, no uno por caso de uso', () => {
      const repositorio = modulo.get(PRODUCTO_REPOSITORIO);
      const casoUso = modulo.get<{ repositorio?: unknown }>(REGISTRAR_PRODUCTO_PUERTO);

      // Un repositorio por caso de uso significaria cinco pools de conexiones.
      expect(casoUso.repositorio).toBe(repositorio);
    });
  });

  describe('fachada', () => {
    it('se construye y es la que recibe el controlador', () => {
      expect(modulo.get(CATALOGO_FACHADA)).toBeInstanceOf(CatalogoFachada);
    });

    /*
     * La fachada recibe cinco casos de uso por constructor, todos con la misma
     * forma. Un `inject` desordenado los cruzaria sin que el compilador dijera
     * nada, y "registrar" acabaria eliminando. Esta comprobacion es la unica
     * defensa contra eso.
     */
    it('recibe cada caso de uso en su posicion, sin cruzarlos', () => {
      const fachada = modulo.get<CatalogoFachada>(CATALOGO_FACHADA);
      const interno = fachada as unknown as Record<string, unknown>;

      expect(interno.registrarProducto).toBe(modulo.get(REGISTRAR_PRODUCTO_PUERTO));
      expect(interno.actualizarProducto).toBe(modulo.get(ACTUALIZAR_PRODUCTO_PUERTO));
      expect(interno.listarProductos).toBe(modulo.get(LISTAR_PRODUCTOS_PUERTO));
      expect(interno.obtenerProducto).toBe(modulo.get(OBTENER_PRODUCTO_PUERTO));
      expect(interno.eliminarProducto).toBe(modulo.get(ELIMINAR_PRODUCTO_PUERTO));
    });
  });
});
