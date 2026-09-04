import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlModule, MssqlService, RegistroNest } from '@hce/compartido';

import {
  CATALOGO_FACHADA,
  ProductoControlador,
} from '../../adaptadores/controladores/producto.controlador';
import { ProductoMssqlPasarela } from '../../adaptadores/pasarelas/producto.mssql.pasarela';
import {
  ProductoPasarelaConReintentos,
  ProductoPasarelaTrazada,
} from '../../adaptadores/pasarelas/producto.pasarela-decoradores';
import { ActualizarProductoCasoUso } from '../../aplicacion/casos-uso/actualizar-producto.caso-uso';
import { EliminarProductoCasoUso } from '../../aplicacion/casos-uso/eliminar-producto.caso-uso';
import { ListarProductosCasoUso } from '../../aplicacion/casos-uso/listar-productos.caso-uso';
import { ObtenerProductoCasoUso } from '../../aplicacion/casos-uso/obtener-producto.caso-uso';
import { RegistrarProductoCasoUso } from '../../aplicacion/casos-uso/registrar-producto.caso-uso';
import { CatalogoFachada } from '../../aplicacion/fachadas/catalogo.fachada';
import {
  ACTUALIZAR_PRODUCTO_PUERTO,
  ActualizarProductoPuerto,
  ELIMINAR_PRODUCTO_PUERTO,
  EliminarProductoPuerto,
  LISTAR_PRODUCTOS_PUERTO,
  ListarProductosPuerto,
  OBTENER_PRODUCTO_PUERTO,
  ObtenerProductoPuerto,
  REGISTRAR_PRODUCTO_PUERTO,
  RegistrarProductoPuerto,
} from '../../aplicacion/puertos/entrada/catalogo.puertos';
import {
  PRODUCTO_REPOSITORIO,
  ProductoRepositorio,
} from '../../aplicacion/puertos/salida/producto.repositorio';

/**
 * CAPA 4 · INFRAESTRUCTURA — Raíz de composición del microservicio de Catálogo.
 *
 * Único lugar donde se decide qué implementación satisface cada puerto. Los
 * casos de uso son clases planas de TypeScript: no llevan `@Injectable()` ni
 * conocen NestJS.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MssqlModule],
  controllers: [ProductoControlador],
  providers: [
    /*
     * Composición de decoradores apilados (patrón Decorator):
     *
     *   Trazado  ->  Reintentos  ->  Pasarela SQL Server
     *
     * El orden importa: el trazado envuelve a los reintentos, de modo que el
     * tiempo registrado es el que percibe realmente el caso de uso, incluidas
     * las esperas entre intentos. Invertirlo mediría un solo intento y ocultaría
     * la latencia real ante un fallo transitorio.
     */
    {
      provide: PRODUCTO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService): ProductoRepositorio =>
        new ProductoPasarelaTrazada(
          new ProductoPasarelaConReintentos(
            new ProductoMssqlPasarela(mssql),
            new RegistroNest('ProductoPasarelaReintentos'),
          ),
          new RegistroNest('ProductoPasarela'),
        ),
    },

    /* --- Casos de uso ------------------------------------------------------ */
    {
      provide: REGISTRAR_PRODUCTO_PUERTO,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (r: ProductoRepositorio): RegistrarProductoPuerto =>
        new RegistrarProductoCasoUso(r),
    },
    {
      provide: ACTUALIZAR_PRODUCTO_PUERTO,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (r: ProductoRepositorio): ActualizarProductoPuerto =>
        new ActualizarProductoCasoUso(r),
    },
    {
      provide: LISTAR_PRODUCTOS_PUERTO,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (r: ProductoRepositorio): ListarProductosPuerto =>
        new ListarProductosCasoUso(r),
    },
    {
      provide: OBTENER_PRODUCTO_PUERTO,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (r: ProductoRepositorio): ObtenerProductoPuerto =>
        new ObtenerProductoCasoUso(r),
    },
    {
      provide: ELIMINAR_PRODUCTO_PUERTO,
      inject: [PRODUCTO_REPOSITORIO],
      useFactory: (r: ProductoRepositorio): EliminarProductoPuerto =>
        new EliminarProductoCasoUso(r),
    },

    /* --- Fachada (patrón Facade) ------------------------------------------- */
    {
      provide: CATALOGO_FACHADA,
      inject: [
        REGISTRAR_PRODUCTO_PUERTO,
        ACTUALIZAR_PRODUCTO_PUERTO,
        LISTAR_PRODUCTOS_PUERTO,
        OBTENER_PRODUCTO_PUERTO,
        ELIMINAR_PRODUCTO_PUERTO,
      ],
      useFactory: (
        registrar: RegistrarProductoPuerto,
        actualizar: ActualizarProductoPuerto,
        listar: ListarProductosPuerto,
        obtener: ObtenerProductoPuerto,
        eliminar: EliminarProductoPuerto,
      ): CatalogoFachada =>
        new CatalogoFachada(registrar, actualizar, listar, obtener, eliminar),
    },
  ],
})
export class CatalogoModule {}
