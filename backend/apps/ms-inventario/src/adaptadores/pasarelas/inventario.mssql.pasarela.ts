import * as sql from 'mssql';

import {
  construirPaginado,
  type MssqlService,
  type ResultadoPaginado,
  type ValorSql,
} from '@hce/compartido';

import type {
  ConsultaKardex,
  ConsultaPeriodo,
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../aplicacion/modelos/inventario.modelos';
import type { InventarioRepositorio } from '../../aplicacion/puertos/salida/inventario.repositorio';
import type {
  LineaCompra,
  LineaVenta,
} from '../../dominio/entidades/inventario.entidades';
import {
  type FilaCompraCab,
  type FilaDetalle,
  type FilaKardexCruda,
  type FilaMovimiento,
  type FilaVentaCab,
  InventarioMapeador,
} from '../mapeadores/inventario.mapeador';

/**
 * CAPA 3 · ADAPTADORES — Pasarela (Gateway) del inventario contra SQL Server.
 *
 * Los detalles de compra y venta viajan como Table-Valued Parameters. Esto
 * evita construir SQL dinámico por línea, manda la operación completa en un
 * solo viaje y deja que el procedimiento almacenado ejecute todo dentro de una
 * transacción: cabecera, detalle, actualización de costo/precio y movimiento del
 * Kardex, o nada.
 */
export class InventarioMssqlPasarela implements InventarioRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  /* --- Compras -------------------------------------------------------------- */

  async registrarCompra(
    lineas: readonly LineaCompra[],
    usuarioApp?: string,
  ): Promise<DocumentoCompra> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento(
      'hce.usp_Compra_Registrar',
      {
        tablas: [
          {
            nombre: 'Detalle',
            tipoTabla: 'hce.TipoDetalleCompra',
            columnas: [
              { nombre: 'Id_producto', tipo: sql.Int },
              { nombre: 'Cantidad', tipo: sql.Decimal(18, 4) },
              { nombre: 'Precio', tipo: sql.Decimal(18, 4) },
            ],
            filas: lineas.map((l): ValorSql[] => [l.idProducto, l.cantidad, l.precio]),
          },
        ],
        parametros: [
          { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null },
        ],
        salidas: [{ nombre: 'Id_CompraCab', tipo: sql.Int, valor: null }],
      },
    );

    return InventarioMapeador.aDocumentoCompra(
      conjuntos[0] as unknown as FilaCompraCab[] | undefined,
      conjuntos[1] as unknown as FilaDetalle[] | undefined,
    );
  }

  async listarCompras(
    consulta: ConsultaPeriodo,
  ): Promise<ResultadoPaginado<ResumenCompra>> {
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = consulta.tamanoPagina ?? 20;

    const filas = await this.mssql.consultar<FilaCompraCab>('hce.usp_Compra_Listar', {
      parametros: this.parametrosPeriodo(consulta, pagina, tamanoPagina),
    });

    return construirPaginado(
      filas.map((f) => InventarioMapeador.aResumenCompra(f)),
      InventarioMapeador.totalRegistros(filas),
      pagina,
      tamanoPagina,
    );
  }

  async obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento(
      'hce.usp_Compra_Obtener',
      {
        parametros: [{ nombre: 'Id_CompraCab', tipo: sql.Int, valor: idCompraCab }],
      },
    );

    const cabeceras = conjuntos[0] as unknown as FilaCompraCab[] | undefined;
    if (!cabeceras?.[0]) return null;

    return InventarioMapeador.aDocumentoCompra(
      cabeceras,
      conjuntos[1] as unknown as FilaDetalle[] | undefined,
    );
  }

  /* --- Ventas --------------------------------------------------------------- */

  async registrarVenta(
    lineas: readonly LineaVenta[],
    usuarioApp?: string,
  ): Promise<DocumentoVenta> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento(
      'hce.usp_Venta_Registrar',
      {
        tablas: [
          {
            nombre: 'Detalle',
            tipoTabla: 'hce.TipoDetalleVenta',
            columnas: [
              { nombre: 'Id_producto', tipo: sql.Int },
              { nombre: 'Cantidad', tipo: sql.Decimal(18, 4) },
            ],
            filas: lineas.map((l): ValorSql[] => [l.idProducto, l.cantidad]),
          },
        ],
        parametros: [
          { nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null },
        ],
        salidas: [{ nombre: 'Id_VentaCab', tipo: sql.Int, valor: null }],
      },
    );

    return InventarioMapeador.aDocumentoVenta(
      conjuntos[0] as unknown as FilaVentaCab[] | undefined,
      conjuntos[1] as unknown as FilaDetalle[] | undefined,
    );
  }

  async listarVentas(
    consulta: ConsultaPeriodo,
  ): Promise<ResultadoPaginado<ResumenVenta>> {
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = consulta.tamanoPagina ?? 20;

    const filas = await this.mssql.consultar<FilaVentaCab>('hce.usp_Venta_Listar', {
      parametros: this.parametrosPeriodo(consulta, pagina, tamanoPagina),
    });

    return construirPaginado(
      filas.map((f) => InventarioMapeador.aResumenVenta(f)),
      InventarioMapeador.totalRegistros(filas),
      pagina,
      tamanoPagina,
    );
  }

  async obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento(
      'hce.usp_Venta_Obtener',
      {
        parametros: [{ nombre: 'Id_VentaCab', tipo: sql.Int, valor: idVentaCab }],
      },
    );

    const cabeceras = conjuntos[0] as unknown as FilaVentaCab[] | undefined;
    if (!cabeceras?.[0]) return null;

    return InventarioMapeador.aDocumentoVenta(
      cabeceras,
      conjuntos[1] as unknown as FilaDetalle[] | undefined,
    );
  }

  /* --- Kardex --------------------------------------------------------------- */

  async listarKardex(consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>> {
    const pagina = consulta.pagina ?? 1;
    const tamanoPagina = consulta.tamanoPagina ?? 20;

    const filas = await this.mssql.consultar<FilaKardexCruda>('hce.usp_Kardex_Listar', {
      parametros: [
        { nombre: 'Buscar', tipo: sql.NVarChar(150), valor: consulta.buscar ?? null },
        { nombre: 'Pagina', tipo: sql.Int, valor: pagina },
        { nombre: 'TamanoPagina', tipo: sql.Int, valor: tamanoPagina },
      ],
    });

    return construirPaginado(
      filas.map((f) => InventarioMapeador.aFilaKardex(f)),
      InventarioMapeador.totalRegistros(filas),
      pagina,
      tamanoPagina,
    );
  }

  async movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]> {
    const filas = await this.mssql.consultar<FilaMovimiento>(
      'hce.usp_Kardex_MovimientosPorProducto',
      {
        parametros: [
          { nombre: 'Id_producto', tipo: sql.Int, valor: idProducto },
          { nombre: 'FechaDesde', tipo: sql.Date, valor: fechaDesde ?? null },
          { nombre: 'FechaHasta', tipo: sql.Date, valor: fechaHasta ?? null },
        ],
      },
    );

    return filas.map((f) => InventarioMapeador.aMovimiento(f));
  }

  /* --- Utilidades privadas --------------------------------------------------- */

  private parametrosPeriodo(
    consulta: ConsultaPeriodo,
    pagina: number,
    tamanoPagina: number,
  ) {
    return [
      { nombre: 'FechaDesde', tipo: sql.Date, valor: consulta.fechaDesde ?? null },
      { nombre: 'FechaHasta', tipo: sql.Date, valor: consulta.fechaHasta ?? null },
      { nombre: 'Pagina', tipo: sql.Int, valor: pagina },
      { nombre: 'TamanoPagina', tipo: sql.Int, valor: tamanoPagina },
    ];
  }
}
