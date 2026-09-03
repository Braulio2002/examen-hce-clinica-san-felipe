import { CasoUso, ResultadoPaginado } from '@hce/compartido';

import {
  ConsultaKardex,
  ConsultaPeriodo,
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  MovimientoProducto,
  MovimientosProductoPeticion,
  ObtenerCompraPeticion,
  ObtenerVentaPeticion,
  RegistrarCompraPeticion,
  RegistrarVentaPeticion,
  ResumenCompra,
  ResumenVenta,
} from '../../modelos/inventario.modelos';

/**
 * CAPA 2 · APLICACION — Puertos de entrada del inventario.
 *
 * Uno por cada operación del enunciado. Son las únicas fronteras por las que el
 * exterior puede atravesar hacia la lógica de negocio.
 */

export type RegistrarCompraPuerto = CasoUso<RegistrarCompraPeticion, DocumentoCompra>;
export const REGISTRAR_COMPRA_PUERTO = Symbol('REGISTRAR_COMPRA_PUERTO');

export type ListarComprasPuerto = CasoUso<ConsultaPeriodo, ResultadoPaginado<ResumenCompra>>;
export const LISTAR_COMPRAS_PUERTO = Symbol('LISTAR_COMPRAS_PUERTO');

export type ObtenerCompraPuerto = CasoUso<ObtenerCompraPeticion, DocumentoCompra>;
export const OBTENER_COMPRA_PUERTO = Symbol('OBTENER_COMPRA_PUERTO');

export type RegistrarVentaPuerto = CasoUso<RegistrarVentaPeticion, DocumentoVenta>;
export const REGISTRAR_VENTA_PUERTO = Symbol('REGISTRAR_VENTA_PUERTO');

export type ListarVentasPuerto = CasoUso<ConsultaPeriodo, ResultadoPaginado<ResumenVenta>>;
export const LISTAR_VENTAS_PUERTO = Symbol('LISTAR_VENTAS_PUERTO');

export type ObtenerVentaPuerto = CasoUso<ObtenerVentaPeticion, DocumentoVenta>;
export const OBTENER_VENTA_PUERTO = Symbol('OBTENER_VENTA_PUERTO');

export type ListarKardexPuerto = CasoUso<ConsultaKardex, ResultadoPaginado<FilaKardex>>;
export const LISTAR_KARDEX_PUERTO = Symbol('LISTAR_KARDEX_PUERTO');

export type MovimientosProductoPuerto = CasoUso<MovimientosProductoPeticion, MovimientoProducto[]>;
export const MOVIMIENTOS_PRODUCTO_PUERTO = Symbol('MOVIMIENTOS_PRODUCTO_PUERTO');
