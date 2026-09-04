import { ErrorInfraestructura } from '@hce/compartido';

import type {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaDocumento,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../aplicacion/modelos/inventario.modelos';
import type { TipoMovimiento } from '../../dominio/entidades/inventario.entidades';

/* --- Formas crudas que devuelven los procedimientos del esquema hce --------- */

export interface FilaCompraCab {
  Id_CompraCab: number;
  FecRegistro: Date;
  SubTotal: number;
  Igv: number;
  Total: number;
  Items?: number;
  Total_registros?: number;
}

export interface FilaVentaCab {
  Id_VentaCab: number;
  fecRegistro: Date;
  SubTotal: number;
  Igv: number;
  Total: number;
  Items?: number;
  Total_registros?: number;
}

export interface FilaDetalle {
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

export interface FilaKardexCruda {
  Id_producto: number;
  Nombre_producto: string;
  NroLote: string;
  Stock_actual: number;
  Costo: number;
  Precio_venta: number;
  Valorizado: number;
  Total_registros?: number;
}

export interface FilaMovimiento {
  Id_MovimientoDet: number;
  Fecha_registro: Date;
  Tipo_movimiento: string;
  Id_TipoMovimiento: TipoMovimiento;
  Documento_origen: number;
  Cantidad: number;
  Saldo: number;
}

/**
 * CAPA 3 · ADAPTADORES — Mapeador entre el modelo de la base y el de aplicación.
 *
 * Traduce los nombres del enunciado (`Id_CompraCab`, `Sub_Total`) al vocabulario
 * en camelCase de la aplicación y normaliza los DECIMAL de SQL Server, que el
 * driver puede entregar como cadena.
 *
 * Está separado de la pasarela a propósito: el mapeo es la parte más propensa a
 * errores silenciosos —un campo mal traducido no rompe la compilación, devuelve
 * un importe equivocado— y así puede probarse de forma aislada.
 */
export const InventarioMapeador = {
  aDocumentoCompra(
    cabeceras: FilaCompraCab[] | undefined,
    detalle: FilaDetalle[] | undefined,
  ): DocumentoCompra {
    const cabecera = cabeceras?.[0];
    if (!cabecera) {
      throw new ErrorInfraestructura(
        'El procedimiento de compra no devolvio la cabecera del documento.',
      );
    }

    return {
      idCompraCab: cabecera.Id_CompraCab,
      fechaRegistro: cabecera.FecRegistro,
      subTotal: cabecera.SubTotal,
      igv: cabecera.Igv,
      total: cabecera.Total,
      detalle: (detalle ?? []).map((d) =>
        InventarioMapeador.aLinea(d, d.Id_CompraDet ?? 0),
      ),
    };
  },

  aDocumentoVenta(
    cabeceras: FilaVentaCab[] | undefined,
    detalle: FilaDetalle[] | undefined,
  ): DocumentoVenta {
    const cabecera = cabeceras?.[0];
    if (!cabecera) {
      throw new ErrorInfraestructura(
        'El procedimiento de venta no devolvio la cabecera del documento.',
      );
    }

    return {
      idVentaCab: cabecera.Id_VentaCab,
      fechaRegistro: cabecera.fecRegistro,
      subTotal: cabecera.SubTotal,
      igv: cabecera.Igv,
      total: cabecera.Total,
      detalle: (detalle ?? []).map((d) =>
        InventarioMapeador.aLinea(d, d.Id_VentaDet ?? 0),
      ),
    };
  },

  aResumenCompra(fila: FilaCompraCab): ResumenCompra {
    return {
      idCompraCab: fila.Id_CompraCab,
      fechaRegistro: fila.FecRegistro,
      subTotal: fila.SubTotal,
      igv: fila.Igv,
      total: fila.Total,
      items: fila.Items ?? 0,
    };
  },

  aResumenVenta(fila: FilaVentaCab): ResumenVenta {
    return {
      idVentaCab: fila.Id_VentaCab,
      fechaRegistro: fila.fecRegistro,
      subTotal: fila.SubTotal,
      igv: fila.Igv,
      total: fila.Total,
      items: fila.Items ?? 0,
    };
  },

  aFilaKardex(fila: FilaKardexCruda): FilaKardex {
    return {
      idProducto: fila.Id_producto,
      nombreProducto: fila.Nombre_producto,
      nroLote: fila.NroLote,
      stockActual: fila.Stock_actual,
      costo: fila.Costo,
      precioVenta: fila.Precio_venta,
      valorizado: fila.Valorizado,
    };
  },

  aMovimiento(fila: FilaMovimiento): MovimientoProducto {
    return {
      idMovimientoDet: fila.Id_MovimientoDet,
      fechaRegistro: fila.Fecha_registro,
      tipoMovimiento: fila.Tipo_movimiento,
      idTipoMovimiento: fila.Id_TipoMovimiento,
      documentoOrigen: fila.Documento_origen,
      cantidad: fila.Cantidad,
      saldo: fila.Saldo,
    };
  },

  aLinea(fila: FilaDetalle, idDetalle: number): LineaDocumento {
    return {
      idDetalle,
      idProducto: fila.Id_producto,
      nombreProducto: fila.Nombre_producto,
      nroLote: fila.NroLote,
      cantidad: fila.Cantidad,
      precio: fila.Precio,
      subTotal: fila.Sub_Total,
      igv: fila.Igv,
      total: fila.Total,
    };
  },

  /** Total repetido en cada fila por COUNT(*) OVER (): se lee de la primera. */
  totalRegistros(filas: { Total_registros?: number }[]): number {
    return filas[0]?.Total_registros ?? 0;
  },
};
