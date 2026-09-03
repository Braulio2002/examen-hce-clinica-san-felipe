import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MssqlModule, MssqlService } from '@hce/compartido';

import { CatalogoFachada } from './aplicacion/catalogo.fachada';
import {
  ActualizarProductoCasoUso,
  EliminarProductoCasoUso,
  ListarProductosCasoUso,
  ObtenerProductoCasoUso,
  RegistrarProductoCasoUso,
} from './aplicacion/casos-uso/productos.casos-uso';
import { PRODUCTO_REPOSITORIO } from './dominio/puertos/producto.repositorio';
import { ProductoControlador } from './infraestructura/controladores/producto.controlador';
import { ProductoMssqlRepositorio } from './infraestructura/persistencia/producto.mssql.repositorio';
import {
  ProductoRepositorioConReintentos,
  ProductoRepositorioTrazado,
} from './infraestructura/persistencia/producto.repositorio-decoradores';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), MssqlModule],
  controllers: [ProductoControlador],
  providers: [
    CatalogoFachada,
    RegistrarProductoCasoUso,
    ActualizarProductoCasoUso,
    ListarProductosCasoUso,
    ObtenerProductoCasoUso,
    EliminarProductoCasoUso,

    /*
     * Composicion de decoradores apilados (patron Decorator).
     *
     *   Trazado  ->  Reintentos  ->  Adaptador SQL Server
     *
     * El orden importa: el trazado envuelve a los reintentos, de modo que el
     * tiempo registrado es el que realmente percibe el caso de uso, incluidas
     * las esperas entre intentos. Invertirlo mediria un solo intento y ocultaria
     * la latencia real ante un fallo transitorio.
     */
    {
      provide: PRODUCTO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService) =>
        new ProductoRepositorioTrazado(
          new ProductoRepositorioConReintentos(new ProductoMssqlRepositorio(mssql)),
        ),
    },
  ],
})
export class CatalogoModule {}
