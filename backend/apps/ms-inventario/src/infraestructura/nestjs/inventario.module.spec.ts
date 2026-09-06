import { Test, type TestingModule } from '@nestjs/testing';

import { MssqlService } from '@hce/compartido';

import {
  INVENTARIO_FACHADA,
  InventarioControlador,
} from '../../adaptadores/controladores/inventario.controlador';
import { InventarioPasarelaTrazada } from '../../adaptadores/pasarelas/inventario.pasarela-trazada';
import { InventarioFachada } from '../../aplicacion/fachadas/inventario.fachada';
import {
  LISTAR_COMPRAS_PUERTO,
  LISTAR_KARDEX_PUERTO,
  LISTAR_VENTAS_PUERTO,
  MOVIMIENTOS_PRODUCTO_PUERTO,
  OBTENER_COMPRA_PUERTO,
  OBTENER_VENTA_PUERTO,
  REGISTRAR_COMPRA_PUERTO,
  REGISTRAR_VENTA_PUERTO,
} from '../../aplicacion/puertos/entrada/inventario.puertos';
import { INVENTARIO_REPOSITORIO } from '../../aplicacion/puertos/salida/inventario.repositorio';

import { InventarioModule } from './inventario.module';

/**
 * Pruebas de la raiz de composicion del microservicio de Inventario.
 *
 * Es el modulo con mas piezas: ocho casos de uso, todos con la misma forma
 * -reciben el repositorio y exponen `ejecutar`- que se inyectan en una fachada
 * de ocho parametros.
 *
 * Esa uniformidad es justo lo que lo hace fragil. Ocho argumentos del mismo
 * tipo estructural significan que cualquier permutacion compila sin una sola
 * queja, y el resultado seria que "registrar una compra" acabe llamando a
 * "registrar una venta": una entrada de stock convertida en salida.
 *
 * La comprobacion posicion a posicion de la fachada es la unica defensa real
 * contra eso, y es la razon principal por la que este archivo existe.
 */
describe('InventarioModule (raiz de composicion)', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    modulo = await Test.createTestingModule({ imports: [InventarioModule] })
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
    expect(modulo.get(InventarioControlador)).toBeInstanceOf(InventarioControlador);
  });

  it('el repositorio llega decorado con trazas', () => {
    expect(modulo.get(INVENTARIO_REPOSITORIO)).toBeInstanceOf(InventarioPasarelaTrazada);
  });

  describe('casos de uso', () => {
    const TODOS = [
      ['registrar compra', REGISTRAR_COMPRA_PUERTO],
      ['listar compras', LISTAR_COMPRAS_PUERTO],
      ['obtener compra', OBTENER_COMPRA_PUERTO],
      ['registrar venta', REGISTRAR_VENTA_PUERTO],
      ['listar ventas', LISTAR_VENTAS_PUERTO],
      ['obtener venta', OBTENER_VENTA_PUERTO],
      ['listar kardex', LISTAR_KARDEX_PUERTO],
      ['movimientos de producto', MOVIMIENTOS_PRODUCTO_PUERTO],
    ] as const;

    it.each(TODOS)('el puerto de %s esta satisfecho y es ejecutable', (_caso, token) => {
      expect(typeof modulo.get<{ ejecutar: unknown }>(token).ejecutar).toBe('function');
    });

    it('los ocho son instancias distintas', () => {
      // Dos tokens resolviendo al mismo objeto significaria que una fabrica
      // construye el caso de uso equivocado.
      expect(new Set(TODOS.map(([, token]) => modulo.get(token))).size).toBe(8);
    });

    it('todos comparten el mismo repositorio', () => {
      const repositorio = modulo.get(INVENTARIO_REPOSITORIO);

      for (const [, token] of TODOS) {
        const casoUso = modulo.get<{ repositorio?: unknown }>(token);
        expect(casoUso.repositorio).toBe(repositorio);
      }
    });
  });

  describe('fachada', () => {
    it('se construye', () => {
      expect(modulo.get(INVENTARIO_FACHADA)).toBeInstanceOf(InventarioFachada);
    });

    /*
     * La comprobacion que da sentido a todo el archivo. Ocho colaboradores del
     * mismo tipo estructural: si el `inject` del modulo se desordenara, el
     * compilador no diria nada y una compra se registraria como venta.
     */
    it('recibe los ocho casos de uso en su posicion exacta', () => {
      const interno = modulo.get<InventarioFachada>(
        INVENTARIO_FACHADA,
      ) as unknown as Record<string, unknown>;

      expect(interno.registrarCompraCasoUso).toBe(modulo.get(REGISTRAR_COMPRA_PUERTO));
      expect(interno.listarComprasCasoUso).toBe(modulo.get(LISTAR_COMPRAS_PUERTO));
      expect(interno.obtenerCompraCasoUso).toBe(modulo.get(OBTENER_COMPRA_PUERTO));
      expect(interno.registrarVentaCasoUso).toBe(modulo.get(REGISTRAR_VENTA_PUERTO));
      expect(interno.listarVentasCasoUso).toBe(modulo.get(LISTAR_VENTAS_PUERTO));
      expect(interno.obtenerVentaCasoUso).toBe(modulo.get(OBTENER_VENTA_PUERTO));
      expect(interno.listarKardexCasoUso).toBe(modulo.get(LISTAR_KARDEX_PUERTO));
      expect(interno.movimientosProductoCasoUso).toBe(
        modulo.get(MOVIMIENTOS_PRODUCTO_PUERTO),
      );
    });

    it('en particular, compra y venta no estan cruzadas', () => {
      const interno = modulo.get<InventarioFachada>(
        INVENTARIO_FACHADA,
      ) as unknown as Record<string, unknown>;

      // El cruce mas caro posible: registraria entradas donde van salidas.
      expect(interno.registrarCompraCasoUso).not.toBe(modulo.get(REGISTRAR_VENTA_PUERTO));
      expect(interno.registrarVentaCasoUso).not.toBe(modulo.get(REGISTRAR_COMPRA_PUERTO));
    });
  });
});
