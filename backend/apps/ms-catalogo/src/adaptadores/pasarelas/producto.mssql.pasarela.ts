import * as sql from 'mssql';

import { construirPaginado, MssqlService, ResultadoPaginado } from '@hce/compartido';

import {
  ActualizarProductoPeticion,
  ListarProductosPeticion,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../aplicacion/modelos/producto.modelos';
import { ProductoRepositorio } from '../../aplicacion/puertos/salida/producto.repositorio';
import { FilaProducto, ProductoMapeador } from '../mapeadores/producto.mapeador';

/**
 * CAPA 3 · ADAPTADORES — Pasarela (Gateway) del catálogo contra SQL Server.
 *
 * Toda la lógica transaccional vive en los procedimientos almacenados; esta
 * pasarela solo traduce entre el lenguaje de la aplicación y el de la base, y
 * delega el mapeo de filas en `ProductoMapeador`.
 *
 * Toda entrada viaja como parámetro tipado del driver, nunca concatenada: es la
 * defensa estructural contra inyección SQL.
 */
export class ProductoMssqlPasarela implements ProductoRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  async registrar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Registrar', {
      parametros: [
        { nombre: 'Nombre_producto', tipo: sql.NVarChar(150), valor: peticion.nombreProducto },
        { nombre: 'NroLote', tipo: sql.NVarChar(50), valor: peticion.nroLote },
        { nombre: 'Costo', tipo: sql.Decimal(18, 4), valor: peticion.costo },
        { nombre: 'PrecioVenta', tipo: sql.Decimal(18, 4), valor: peticion.precioVenta ?? null },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: peticion.usuarioApp ?? null },
      ],
    });

    return ProductoMapeador.aRespuesta(this.primeraFila(filas, 'registrar'));
  }

  async actualizar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Actualizar', {
      parametros: [
        { nombre: 'Id_producto', tipo: sql.Int, valor: peticion.idProducto },
        {
          nombre: 'Nombre_producto',
          tipo: sql.NVarChar(150),
          valor: peticion.nombreProducto ?? null,
        },
        { nombre: 'NroLote', tipo: sql.NVarChar(50), valor: peticion.nroLote ?? null },
        { nombre: 'Costo', tipo: sql.Decimal(18, 4), valor: peticion.costo ?? null },
        { nombre: 'PrecioVenta', tipo: sql.Decimal(18, 4), valor: peticion.precioVenta ?? null },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: peticion.usuarioApp ?? null },
      ],
    });

    return ProductoMapeador.aRespuesta(this.primeraFila(filas, 'actualizar'));
  }

  async listar(peticion: ListarProductosPeticion): Promise<ResultadoPaginado<ProductoRespuesta>> {
    const pagina = peticion.pagina ?? 1;
    const tamanoPagina = peticion.tamanoPagina ?? 20;

    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Listar', {
      parametros: [
        { nombre: 'Buscar', tipo: sql.NVarChar(150), valor: peticion.buscar ?? null },
        { nombre: 'SoloConStock', tipo: sql.Bit, valor: peticion.soloConStock ?? false },
        { nombre: 'Pagina', tipo: sql.Int, valor: pagina },
        { nombre: 'TamanoPagina', tipo: sql.Int, valor: tamanoPagina },
      ],
    });

    return construirPaginado(
      ProductoMapeador.aRespuestas(filas),
      ProductoMapeador.totalRegistros(filas),
      pagina,
      tamanoPagina,
    );
  }

  async obtener(idProducto: number): Promise<ProductoRespuesta | null> {
    const filas = await this.mssql.consultar<FilaProducto>('hce.usp_Producto_Obtener', {
      parametros: [{ nombre: 'Id_producto', tipo: sql.Int, valor: idProducto }],
    });

    return filas[0] ? ProductoMapeador.aRespuesta(filas[0]) : null;
  }

  async eliminar(idProducto: number, usuarioApp?: string): Promise<void> {
    await this.mssql.ejecutarProcedimiento('hce.usp_Producto_Eliminar', {
      parametros: [
        { nombre: 'Id_producto', tipo: sql.Int, valor: idProducto },
        { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null },
      ],
    });
  }

  /**
   * Los procedimientos de escritura devuelven siempre la fila resultante. Si no
   * llega, el contrato con la base se rompió: es un fallo de infraestructura,
   * no un caso de negocio, y debe hacerse visible en lugar de degradar a null.
   */
  private primeraFila(filas: FilaProducto[], operacion: string): FilaProducto {
    const fila = filas[0];
    if (!fila) {
      throw new Error(
        `El procedimiento de ${operacion} no devolvio la fila del producto afectado.`,
      );
    }
    return fila;
  }
}
