/**
 * Contratos de la API HCE.
 *
 * Este paquete es el unico lugar donde vive la forma de los datos que
 * intercambian las zonas del microfront con el API Gateway. Ambas zonas lo
 * consumen como dependencia de workspace, de modo que un cambio en el contrato
 * rompe la compilacion de las dos y no se descubre en produccion.
 */

export type RolUsuario = 'ADMIN' | 'FARMACIA' | 'CONSULTA';

export interface PerfilUsuario {
  id: number;
  username: string;
  nombreCompleto: string;
  rol: RolUsuario;
}

export interface RespuestaLogin {
  accessToken: string;
  expiraEnSegundos: number;
  usuario: PerfilUsuario;
}

export interface Producto {
  idProducto: number;
  nombreProducto: string;
  nroLote: string;
  fechaRegistro: string;
  costo: number;
  precioVenta: number;
  stockActual: number;
}

export interface LineaDocumento {
  idDetalle: number;
  idProducto: number;
  nombreProducto: string;
  nroLote: string;
  cantidad: number;
  precio: number;
  subTotal: number;
  igv: number;
  total: number;
}

export interface Compra {
  idCompraCab: number;
  fechaRegistro: string;
  subTotal: number;
  igv: number;
  total: number;
  detalle: LineaDocumento[];
}

export interface Venta {
  idVentaCab: number;
  fechaRegistro: string;
  subTotal: number;
  igv: number;
  total: number;
  detalle: LineaDocumento[];
}

export interface ResumenCompra {
  idCompraCab: number;
  fechaRegistro: string;
  subTotal: number;
  igv: number;
  total: number;
  items: number;
}

export interface ResumenVenta {
  idVentaCab: number;
  fechaRegistro: string;
  subTotal: number;
  igv: number;
  total: number;
  items: number;
}

export interface FilaKardex {
  idProducto: number;
  nombreProducto: string;
  nroLote: string;
  stockActual: number;
  costo: number;
  precioVenta: number;
  valorizado: number;
}

export interface MovimientoProducto {
  idMovimientoDet: number;
  fechaRegistro: string;
  tipoMovimiento: 'Entrada' | 'Salida';
  idTipoMovimiento: 1 | 2;
  documentoOrigen: number;
  cantidad: number;
  saldo: number;
}

export interface MetaPaginacion {
  pagina: number;
  tamanoPagina: number;
  totalRegistros: number;
  totalPaginas: number;
}

export interface ResultadoPaginado<T> {
  datos: T[];
  meta: MetaPaginacion;
}

/** Cuerpo de error uniforme que devuelve el API Gateway. */
export interface RespuestaError {
  exito: false;
  codigo: string;
  mensaje: string;
  detalles?: unknown;
  ruta: string;
  marcaTiempo: string;
}

/** Payloads de escritura. */
export interface AltaProducto {
  nombreProducto: string;
  nroLote: string;
  costo: number;
  precioVenta?: number;
}

export interface LineaCompraPayload {
  idProducto: number;
  cantidad: number;
  precio: number;
}

export interface LineaVentaPayload {
  idProducto: number;
  cantidad: number;
}
