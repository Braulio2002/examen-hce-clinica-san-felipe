import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlModule, MssqlService, RegistroNest } from '@hce/compartido';

import { ListarComprasCasoUso } from '../../aplicacion/casos-uso/listar-compras.caso-uso';
import { ListarKardexCasoUso } from '../../aplicacion/casos-uso/listar-kardex.caso-uso';
import { ListarVentasCasoUso } from '../../aplicacion/casos-uso/listar-ventas.caso-uso';
import { MovimientosProductoCasoUso } from '../../aplicacion/casos-uso/movimientos-producto.caso-uso';
import { ObtenerCompraCasoUso } from '../../aplicacion/casos-uso/obtener-compra.caso-uso';
import { ObtenerVentaCasoUso } from '../../aplicacion/casos-uso/obtener-venta.caso-uso';
import { RegistrarCompraCasoUso } from '../../aplicacion/casos-uso/registrar-compra.caso-uso';
import { RegistrarVentaCasoUso } from '../../aplicacion/casos-uso/registrar-venta.caso-uso';
import { InventarioFachada } from '../../aplicacion/fachadas/inventario.fachada';
import {
  LISTAR_COMPRAS_PUERTO,
  LISTAR_KARDEX_PUERTO,
  LISTAR_VENTAS_PUERTO,
  ListarComprasPuerto,
  ListarKardexPuerto,
  ListarVentasPuerto,
  MOVIMIENTOS_PRODUCTO_PUERTO,
  MovimientosProductoPuerto,
  OBTENER_COMPRA_PUERTO,
  OBTENER_VENTA_PUERTO,
  ObtenerCompraPuerto,
  ObtenerVentaPuerto,
  REGISTRAR_COMPRA_PUERTO,
  REGISTRAR_VENTA_PUERTO,
  RegistrarCompraPuerto,
  RegistrarVentaPuerto,
} from '../../aplicacion/puertos/entrada/inventario.puertos';
import {
  INVENTARIO_REPOSITORIO,
  InventarioRepositorio,
} from '../../aplicacion/puertos/salida/inventario.repositorio';
import {
  INVENTARIO_FACHADA,
  InventarioControlador,
} from '../../adaptadores/controladores/inventario.controlador';
import { InventarioMssqlPasarela } from '../../adaptadores/pasarelas/inventario.mssql.pasarela';
import { InventarioPasarelaTrazada } from '../../adaptadores/pasarelas/inventario.pasarela-trazada';

/**
 * CAPA 4 · INFRAESTRUCTURA — Raíz de composición del microservicio de Inventario.
 *
 * Ocho casos de uso, un puerto de salida decorado y una fachada, todo cableado
 * de forma explícita. Ninguna de esas clases lleva decoradores de NestJS: son
 * TypeScript puro, y por eso la suite de pruebas del dominio y la aplicación
 * corre sin contenedor de inyección.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MssqlModule],
  controllers: [InventarioControlador],
  providers: [
    /* --- Puerto de salida, con el patrón Decorator aplicado ---------------- */
    {
      provide: INVENTARIO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService): InventarioRepositorio =>
        new InventarioPasarelaTrazada(
          new InventarioMssqlPasarela(mssql),
          new RegistroNest('InventarioPasarela'),
        ),
    },

    /* --- Casos de uso: compras --------------------------------------------- */
    {
      provide: REGISTRAR_COMPRA_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): RegistrarCompraPuerto =>
        new RegistrarCompraCasoUso(r, new RegistroNest('RegistrarCompra')),
    },
    {
      provide: LISTAR_COMPRAS_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): ListarComprasPuerto => new ListarComprasCasoUso(r),
    },
    {
      provide: OBTENER_COMPRA_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): ObtenerCompraPuerto => new ObtenerCompraCasoUso(r),
    },

    /* --- Casos de uso: ventas ---------------------------------------------- */
    {
      provide: REGISTRAR_VENTA_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): RegistrarVentaPuerto =>
        new RegistrarVentaCasoUso(r, new RegistroNest('RegistrarVenta')),
    },
    {
      provide: LISTAR_VENTAS_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): ListarVentasPuerto => new ListarVentasCasoUso(r),
    },
    {
      provide: OBTENER_VENTA_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): ObtenerVentaPuerto => new ObtenerVentaCasoUso(r),
    },

    /* --- Casos de uso: Kardex ---------------------------------------------- */
    {
      provide: LISTAR_KARDEX_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): ListarKardexPuerto => new ListarKardexCasoUso(r),
    },
    {
      provide: MOVIMIENTOS_PRODUCTO_PUERTO,
      inject: [INVENTARIO_REPOSITORIO],
      useFactory: (r: InventarioRepositorio): MovimientosProductoPuerto =>
        new MovimientosProductoCasoUso(r),
    },

    /* --- Fachada (patrón Facade) ------------------------------------------- */
    {
      provide: INVENTARIO_FACHADA,
      inject: [
        REGISTRAR_COMPRA_PUERTO,
        LISTAR_COMPRAS_PUERTO,
        OBTENER_COMPRA_PUERTO,
        REGISTRAR_VENTA_PUERTO,
        LISTAR_VENTAS_PUERTO,
        OBTENER_VENTA_PUERTO,
        LISTAR_KARDEX_PUERTO,
        MOVIMIENTOS_PRODUCTO_PUERTO,
      ],
      useFactory: (
        registrarCompra: RegistrarCompraPuerto,
        listarCompras: ListarComprasPuerto,
        obtenerCompra: ObtenerCompraPuerto,
        registrarVenta: RegistrarVentaPuerto,
        listarVentas: ListarVentasPuerto,
        obtenerVenta: ObtenerVentaPuerto,
        listarKardex: ListarKardexPuerto,
        movimientos: MovimientosProductoPuerto,
      ): InventarioFachada =>
        new InventarioFachada(
          registrarCompra,
          listarCompras,
          obtenerCompra,
          registrarVenta,
          listarVentas,
          obtenerVenta,
          listarKardex,
          movimientos,
        ),
    },
  ],
})
export class InventarioModule {}
