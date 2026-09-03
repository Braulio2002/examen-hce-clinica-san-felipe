import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';

import { construirPaginado, ErrorNoEncontrado, MssqlService, ResultadoPaginado } from '@hce/compartido';

import { ProductoConStock } from '../../dominio/entidades/producto.entidad';
import {
  CriteriosBusquedaProducto,
  DatosActualizacionProducto,
  DatosAltaProducto,
  ProductoRepositorio,
} from '../../dominio/puertos/producto.repositorio';

/** Fila cruda tal como la devuelven los procedimientos del esquema hce. */
interface FilaProducto {
  Id_producto: number;
  Nombre_producto: string;
  NroLote: string;
  Fec_registro: Date;
  Costo: number;
  PrecioVenta: number;
  Stock_actual?: number;
  Total_registros?: number;
}

/**
 * Adaptador de salida del catalogo contra SQL Server.
 *
 * Toda la logica transaccional vive en los procedimientos almacenados; este
 * adaptador solo traduce entre el lenguaje del dominio (camelCase, tipos de
 * TypeScript) y el de la base (nombres del enunciado, tipos T-SQL).
 */
@Injectable()
export class ProductoMssqlRepositorio implements ProductoRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  async registrar(datos: DatosAltaProducto): Promise<ProductoConStock> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Registrar', {
      parametros: [
        { nombre: 'Nombre_producto', tipo: sql.NVarChar(150), valor: datos.nombreProducto },
        { nombre: 'NroLote', tipo: sql.NVarChar(50), valor: datos.nroLote },
        { nombre: 'Costo', tipo: sql.Decimal(18, 4), valor: datos.costo },
        { nombre: 'PrecioVenta', tipo: sql.Decimal(18, 4), valor: datos.precioVenta ?? null },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: datos.usuarioApp ?? null },
      ],
    });

    return this.mapear(this.primeraFilaObligatoria(filas, 'Producto'));
  }

  async actualizar(datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Actualizar', {
      parametros: [
        { nombre: 'Id_producto', tipo: sql.Int, valor: datos.idProducto },
        {
          nombre: 'Nombre_producto',
          tipo: sql.NVarChar(150),
          valor: datos.nombreProducto ?? null,
        },
        { nombre: 'NroLote', tipo: sql.NVarChar(50), valor: datos.nroLote ?? null },
        { nombre: 'Costo', tipo: sql.Decimal(18, 4), valor: datos.costo ?? null },
        { nombre: 'PrecioVenta', tipo: sql.Decimal(18, 4), valor: datos.precioVenta ?? null },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: datos.usuarioApp ?? null },
      ],
    });

    return this.mapear(this.primeraFilaObligatoria(filas, 'Producto', datos.idProducto));
  }

  async listar(
    criterios: CriteriosBusquedaProducto,
  ): Promise<ResultadoPaginado<ProductoConStock>> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Listar', {
      parametros: [
        { nombre: 'Buscar', tipo: sql.NVarChar(150), valor: criterios.buscar ?? null },
        { nombre: 'SoloConStock', tipo: sql.Bit, valor: criterios.soloConStock ?? false },
        { nombre: 'Pagina', tipo: sql.Int, valor: criterios.pagina },
        { nombre: 'TamanoPagina', tipo: sql.Int, valor: criterios.tamanoPagina },
      ],
    });

    /*
     * Total_registros llega repetido en cada fila via COUNT(*) OVER (). Se lee
     * de la primera y se descarta: asi el listado y su total viajan en una sola
     * ida a la base en lugar de dos consultas.
     */
    const total = filas[0]?.Total_registros ?? 0;

    return construirPaginado(
      filas.map((f) => this.mapear(f)),
      total,
      criterios.pagina,
      criterios.tamanoPagina,
    );
  }

  async obtener(idProducto: number): Promise<ProductoConStock | null> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Obtener', {
      parametros: [{ nombre: 'Id_producto', tipo: sql.Int, valor: idProducto }],
    });

    return filas[0] ? this.mapear(filas[0]) : null;
  }

  async eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    await this.mssql.ejecutarProcedimiento('hce.usp_Producto_Eliminar', {
      parametros: [
        { nombre: 'Id_producto', tipo: sql.Int, valor: idProducto },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null },
      ],
    });
  }

  private primeraFilaObligatoria(
    filas: FilaProducto[],
    recurso: string,
    identificador?: number,
  ): FilaProducto {
    const fila = filas[0];
    if (!fila) throw new ErrorNoEncontrado(recurso, identificador);
    return fila;
  }

  private mapear(fila: FilaProducto): ProductoConStock {
    return {
      idProducto: fila.Id_producto,
      nombreProducto: fila.Nombre_producto,
      nroLote: fila.NroLote,
      fechaRegistro: fila.Fec_registro,
      costo: Number(fila.Costo),
      precioVenta: Number(fila.PrecioVenta),
      stockActual: Number(fila.Stock_actual ?? 0),
    };
  }
}
