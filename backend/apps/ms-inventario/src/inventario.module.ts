import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlModule, MssqlService } from '@hce/compartido';

import { InventarioFachada } from './aplicacion/inventario.fachada';
import {
  ListarComprasCasoUso,
  ListarKardexCasoUso,
  ListarVentasCasoUso,
  MovimientosProductoCasoUso,
  ObtenerCompraCasoUso,
  ObtenerVentaCasoUso,
  RegistrarCompraCasoUso,
  RegistrarVentaCasoUso,
} from './aplicacion/casos-uso/inventario.casos-uso';
import { INVENTARIO_REPOSITORIO } from './dominio/puertos/inventario.repositorio';
import { InventarioControlador } from './infraestructura/controladores/inventario.controlador';
import { InventarioMssqlRepositorio } from './infraestructura/persistencia/inventario.mssql.repositorio';
import { InventarioRepositorioTrazado } from './infraestructura/persistencia/inventario.repositorio-trazado';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MssqlModule],
  controllers: [InventarioControlador],
  providers: [
    InventarioFachada,
    RegistrarCompraCasoUso,
    ListarComprasCasoUso,
    ObtenerCompraCasoUso,
    RegistrarVentaCasoUso,
    ListarVentasCasoUso,
    ObtenerVentaCasoUso,
    ListarKardexCasoUso,
    MovimientosProductoCasoUso,

    /* Decorator: trazabilidad sobre el adaptador de SQL Server. */
    {
      provide: INVENTARIO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService) =>
        new InventarioRepositorioTrazado(new InventarioMssqlRepositorio(mssql)),
    },
  ],
})
export class InventarioModule {}
