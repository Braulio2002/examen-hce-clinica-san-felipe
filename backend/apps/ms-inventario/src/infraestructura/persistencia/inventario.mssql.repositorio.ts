import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';

import {
  construirPaginado,
  ErrorInfraestructura,
  MssqlService,
  ResultadoPaginado,
  ValorSql,
} from '@hce/compartido';

import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaDocumento,
  LineaVenta,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
  TipoMovimiento,
} from '../../dominio/entidades/inventario.entidades';
import {
  CriteriosKardex,
  FiltroPeriodo,
  InventarioRepositorio,
} from '../../dominio/puertos/inventario.repositorio';

/* --- Formas crudas devueltas por los procedimientos del esquema hce --------- */

interface FilaCompraCab {
  Id_CompraCab: number;
  FecRegistro: Date;
  SubTotal: number;
  Igv: number;
  Total: number;
  Items?: number;
  Total_registros?: number;
}

interface FilaVentaCab {
  Id_VentaCab: number;
  fecRegistro: Date;
  SubTotal: number;
  Igv: number;
  Total: number;
  Items?: number;
  Total_registros?: number;
}

interface FilaDetalle {
  Id_CompraDet?: number;
  Id_VentaDet?: number;
  Id_producto: number;
  Nombre_producto: string;
  NroLote: string;
  Cantidad: number;
  Precio: number;
  Sub_Total: number;
  Igv: number;
  Total: number;
}

interface FilaKardexCruda {
  Id_producto: number;
  Nombre_producto: string;
  NroLote: string;
  Stock_actual: number;
  Costo: number;
  Precio_venta: number;
  Valorizado: number;
  Total_registros?: number;
}

interface FilaMovimiento {
  Id_MovimientoDet: number;
  Fecha_registro: Date;
  Tipo_movimiento: string;
  Id_TipoMovimiento: TipoMovimiento;
  Documento_origen: number;
  Cantidad: number;
  Saldo: number;
}

/**
 * Adaptador de salida del inventario contra SQL Server.
 *
 * Los detalles de compra y venta viajan como Table-Valued Parameters. Esto
 * evita construir SQL dinamico por linea, manda la operacion completa en un
 * solo viaje y deja que el procedimiento almacenado ejecute todo dentro de una
 * transaccion: cabecera, detalle, actualizacion de costo/precio y movimiento
 * del Kardex, o nada.
 */
@Injectable()
export class InventarioMssqlRepositorio implements InventarioRepositorio {
  constructor(private readonly mssql: MssqlService) {}

  /* --- Compras ------------------------------------------------------------- */

  async registrarCompra(
    lineas: readonly LineaCompra[],
    usuarioApp?: string,
  ): Promise<DocumentoCompra> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento('hce.usp_Compra_Registrar', {
      tablas: [
        {
          nombre: 'Detalle',
          tipoTabla: 'hce.TipoDetalleCompra',
          columnas: [
            { nombre: 'Id_producto', tipo: sql.Int },
            { nombre: 'Cantidad', tipo: sql.Decimal(18, 4) },
            { nombre: 'Precio', tipo: sql.Decimal(18, 4) },
          ],
          filas: lineas.map(
            (l): ValorSql[] => [l.idProducto, l.cantidad, l.precio],
          ),
        },
      ],
      parametros: [{ nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null }],
      salidas: [{ nombre: 'Id_CompraCab', tipo: sql.Int, valor: null }],
    });

    return this.armarCompra(
      conjuntos[0] as unknown as FilaCompraCab[],
      conjuntos[1] as unknown as FilaDetalle[],
    );
  }

  async listarCompras(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    const filas = await this.mssql.consultar<FilaCompraCab>('hce.usp_Compra_Listar', {
      parametros: this.parametrosPeriodo(filtro),
    });

    return construirPaginado(
      filas.map((f) => ({
        idCompraCab: f.Id_CompraCab,
        fechaRegistro: f.FecRegistro,
        subTotal: Number(f.SubTotal),
        igv: Number(f.Igv),
        total: Number(f.Total),
        items: Number(f.Items ?? 0),
      })),
      filas[0]?.Total_registros ?? 0,
      filtro.pagina,
      filtro.tamanoPagina,
    );
  }

  async obtenerCompra(idCompraCab: number): Promise<DocumentoCompra | null> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento('hce.usp_Compra_Obtener', {
      parametros: [{ nombre: 'Id_CompraCab', tipo: sql.Int, valor: idCompraCab }],
    });

    const cabeceras = conjuntos[0] as unknown as FilaCompraCab[];
    if (!cabeceras?.[0]) return null;

    return this.armarCompra(cabeceras, conjuntos[1] as unknown as FilaDetalle[]);
  }

  /* --- Ventas -------------------------------------------------------------- */

  async registrarVenta(
    lineas: readonly LineaVenta[],
    usuarioApp?: string,
  ): Promise<DocumentoVenta> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento('hce.usp_Venta_Registrar', {
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
      parametros: [{ nombre: 'UsuarioApp', tipo: sql.NVarChar(100), valor: usuarioApp ?? null }],
      salidas: [{ nombre: 'Id_VentaCab', tipo: sql.Int, valor: null }],
    });

    return this.armarVenta(
      conjuntos[0] as unknown as FilaVentaCab[],
      conjuntos[1] as unknown as FilaDetalle[],
    );
  }

  async listarVentas(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    const filas = await this.mssql.consultar<FilaVentaCab>('hce.usp_Venta_Listar', {
      parametros: this.parametrosPeriodo(filtro),
    });

    return construirPaginado(
      filas.map((f) => ({
        idVentaCab: f.Id_VentaCab,
        fechaRegistro: f.fecRegistro,
        subTotal: Number(f.SubTotal),
        igv: Number(f.Igv),
        total: Number(f.Total),
        items: Number(f.Items ?? 0),
      })),
      filas[0]?.Total_registros ?? 0,
      filtro.pagina,
      filtro.tamanoPagina,
    );
  }

  async obtenerVenta(idVentaCab: number): Promise<DocumentoVenta | null> {
    const { conjuntos } = await this.mssql.ejecutarProcedimiento('hce.usp_Venta_Obtener', {
      parametros: [{ nombre: 'Id_VentaCab', tipo: sql.Int, valor: idVentaCab }],
    });

    const cabeceras = conjuntos[0] as unknown as FilaVentaCab[];
    if (!cabeceras?.[0]) return null;

    return this.armarVenta(cabeceras, conjuntos[1] as unknown as FilaDetalle[]);
  }

  /* --- Kardex -------------------------------------------------------------- */

  async listarKardex(criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>> {
    const filas = await this.mssql.consultar<FilaKardexCruda>('hce.usp_Kardex_Listar', {
      parametros: [
        { nombre: 'Buscar', tipo: sql.NVarChar(150), valor: criterios.buscar ?? null },
        { nombre: 'Pagina', tipo: sql.Int, valor: criterios.pagina },
        { nombre: 'TamanoPagina', tipo: sql.Int, valor: criterios.tamanoPagina },
      ],
    });

    return construirPaginado(
      filas.map((f) => ({
        idProducto: f.Id_producto,
        nombreProducto: f.Nombre_producto,
        nroLote: f.NroLote,
        stockActual: Number(f.Stock_actual),
        costo: Number(f.Costo),
        precioVenta: Number(f.Precio_venta),
        valorizado: Number(f.Valorizado),
      })),
      filas[0]?.Total_registros ?? 0,
      criterios.pagina,
      criterios.tamanoPagina,
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

    return filas.map((f) => ({
      idMovimientoDet: f.Id_MovimientoDet,
      fechaRegistro: f.Fecha_registro,
      tipoMovimiento: f.Tipo_movimiento,
      idTipoMovimiento: f.Id_TipoMovimiento,
      documentoOrigen: f.Documento_origen,
      cantidad: Number(f.Cantidad),
      saldo: Number(f.Saldo),
    }));
  }

  /* --- Utilidades privadas -------------------------------------------------- */

  private parametrosPeriodo(filtro: FiltroPeriodo) {
    return [
      { nombre: 'FechaDesde', tipo: sql.Date, valor: filtro.fechaDesde ?? null },
      { nombre: 'FechaHasta', tipo: sql.Date, valor: filtro.fechaHasta ?? null },
      { nombre: 'Pagina', tipo: sql.Int, valor: filtro.pagina },
      { nombre: 'TamanoPagina', tipo: sql.Int, valor: filtro.tamanoPagina },
    ];
  }

  private armarCompra(cabeceras: FilaCompraCab[], detalle: FilaDetalle[]): DocumentoCompra {
    const cabecera = cabeceras?.[0];
    if (!cabecera) {
      throw new ErrorInfraestructura(
        'El procedimiento de compra no devolvio la cabecera del documento.',
      );
    }

    return {
      idCompraCab: cabecera.Id_CompraCab,
      fechaRegistro: cabecera.FecRegistro,
      subTotal: Number(cabecera.SubTotal),
      igv: Number(cabecera.Igv),
      total: Number(cabecera.Total),
      detalle: (detalle ?? []).map((d) => this.mapearLinea(d, d.Id_CompraDet ?? 0)),
    };
  }

  private armarVenta(cabeceras: FilaVentaCab[], detalle: FilaDetalle[]): DocumentoVenta {
    const cabecera = cabeceras?.[0];
    if (!cabecera) {
      throw new ErrorInfraestructura(
        'El procedimiento de venta no devolvio la cabecera del documento.',
      );
    }

    return {
      idVentaCab: cabecera.Id_VentaCab,
      fechaRegistro: cabecera.fecRegistro,
      subTotal: Number(cabecera.SubTotal),
      igv: Number(cabecera.Igv),
      total: Number(cabecera.Total),
      detalle: (detalle ?? []).map((d) => this.mapearLinea(d, d.Id_VentaDet ?? 0)),
    };
  }

  private mapearLinea(fila: FilaDetalle, idDetalle: number): LineaDocumento {
    return {
      idDetalle,
      idProducto: fila.Id_producto,
      nombreProducto: fila.Nombre_producto,
      nroLote: fila.NroLote,
      cantidad: Number(fila.Cantidad),
      precio: Number(fila.Precio),
      subTotal: Number(fila.Sub_Total),
      igv: Number(fila.Igv),
      total: Number(fila.Total),
    };
  }
}
