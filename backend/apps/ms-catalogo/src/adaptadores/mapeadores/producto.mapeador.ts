import type { ProductoRespuesta } from '../../aplicacion/modelos/producto.modelos';

/** Forma cruda de la fila que devuelven los procedimientos del esquema hce. */
export interface FilaProducto {
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
 * CAPA 3 · ADAPTADORES — Mapeador entre el modelo de la base y el de aplicación.
 *
 * Traduce nombres del enunciado (`Id_producto`, `Nombre_producto`) al
 * vocabulario en camelCase que usa la aplicación, y normaliza los DECIMAL de
 * SQL Server, que el driver puede entregar como cadena.
 *
 * Está separado de la pasarela a propósito: el mapeo es la parte más propensa a
 * errores silenciosos y así puede probarse de forma aislada, sin base de datos.
 */
export const ProductoMapeador = {
  aRespuesta(fila: FilaProducto): ProductoRespuesta {
    return {
      idProducto: fila.Id_producto,
      nombreProducto: fila.Nombre_producto,
      nroLote: fila.NroLote,
      fechaRegistro: fila.Fec_registro,
      costo: fila.Costo,
      precioVenta: fila.PrecioVenta,
      stockActual: fila.Stock_actual ?? 0,
    };
  },

  aRespuestas(filas: FilaProducto[]): ProductoRespuesta[] {
    return filas.map((f) => ProductoMapeador.aRespuesta(f));
  },

  /**
   * Total de registros del listado.
   * SQL Server lo repite en cada fila vía COUNT(*) OVER (), de modo que el
   * listado y su total viajan en una sola ida a la base en lugar de dos.
   */
  totalRegistros(filas: FilaProducto[]): number {
    return filas[0]?.Total_registros ?? 0;
  },
};
