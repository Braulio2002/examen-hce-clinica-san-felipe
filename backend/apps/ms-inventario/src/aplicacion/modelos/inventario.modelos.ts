import { LineaCompra, LineaVenta, TipoMovimiento } from '../../dominio/entidades/inventario.entidades';

/**
 * CAPA 2 · APLICACION — Modelos que cruzan las fronteras del inventario.
 *
 * Estos tipos vivían antes en la carpeta de dominio, y era un error: un
 * `ResumenCompra` con `items` no es una regla de negocio, es una proyección de
 * lectura pensada para una grilla. En Clean Architecture pertenecen a la capa
 * de aplicación, no a la de entidades.
 */

/* --- Peticiones ------------------------------------------------------------ */

export interface RegistrarCompraPeticion {
  readonly lineas: readonly LineaCompra[];
  readonly usuarioApp?: string;
}

export interface RegistrarVentaPeticion {
  readonly lineas: readonly LineaVenta[];
  readonly usuarioApp?: string;
}

export interface ConsultaPeriodo {
  readonly fechaDesde?: string;
  readonly fechaHasta?: string;
  readonly pagina?: number;
  readonly tamanoPagina?: number;
}

export interface ConsultaKardex {
  readonly buscar?: string;
  readonly pagina?: number;
  readonly tamanoPagina?: number;
}

export interface ObtenerCompraPeticion {
  readonly idCompraCab: number;
}

export interface ObtenerVentaPeticion {
  readonly idVentaCab: number;
}

export interface MovimientosProductoPeticion {
  readonly idProducto: number;
  readonly fechaDesde?: string;
  readonly fechaHasta?: string;
}

/* --- Respuestas ------------------------------------------------------------ */

/** Línea persistida, con los importes ya calculados por el servidor. */
export interface LineaDocumento {
  readonly idDetalle: number;
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly cantidad: number;
  readonly precio: number;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
}

export interface DocumentoCompra {
  readonly idCompraCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly detalle: readonly LineaDocumento[];
}

export interface DocumentoVenta {
  readonly idVentaCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly detalle: readonly LineaDocumento[];
}

export interface ResumenCompra {
  readonly idCompraCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly items: number;
}

export interface ResumenVenta {
  readonly idVentaCab: number;
  readonly fechaRegistro: Date;
  readonly subTotal: number;
  readonly igv: number;
  readonly total: number;
  readonly items: number;
}

/** Fila de la grilla principal del Kardex (sección 1.2.3 del enunciado). */
export interface FilaKardex {
  readonly idProducto: number;
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly stockActual: number;
  readonly costo: number;
  readonly precioVenta: number;
  readonly valorizado: number;
}

/** Fila del modal de movimientos de un producto. */
export interface MovimientoProducto {
  readonly idMovimientoDet: number;
  readonly fechaRegistro: Date;
  readonly tipoMovimiento: string;
  readonly idTipoMovimiento: TipoMovimiento;
  readonly documentoOrigen: number;
  readonly cantidad: number;
  /** Saldo acumulado tras el movimiento: convierte la lista en un Kardex real. */
  readonly saldo: number;
}
