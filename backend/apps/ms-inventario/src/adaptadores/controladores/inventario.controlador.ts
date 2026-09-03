import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_INVENTARIO, ResultadoPaginado } from '@hce/compartido';

import { InventarioFachada } from '../../aplicacion/fachadas/inventario.fachada';
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
} from '../../aplicacion/modelos/inventario.modelos';

export const INVENTARIO_FACHADA = Symbol('INVENTARIO_FACHADA');

/**
 * CAPA 3 · ADAPTADORES — Controlador de transporte TCP del inventario.
 *
 * Traduce mensajes a llamadas de la fachada y nada más. Cada método es una
 * línea: ésa es la señal de que la lógica está donde debe estar.
 */
@Controller()
export class InventarioControlador {
  constructor(@Inject(INVENTARIO_FACHADA) private readonly fachada: InventarioFachada) {}

  /* --- Compras -------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.REGISTRAR_COMPRA)
  registrarCompra(@Payload() peticion: RegistrarCompraPeticion): Promise<DocumentoCompra> {
    return this.fachada.registrarCompra(peticion);
  }

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_COMPRAS)
  listarCompras(@Payload() consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return this.fachada.listarCompras(consulta);
  }

  @MessagePattern(PATRONES_INVENTARIO.OBTENER_COMPRA)
  obtenerCompra(@Payload() peticion: ObtenerCompraPeticion): Promise<DocumentoCompra> {
    return this.fachada.obtenerCompra(peticion);
  }

  /* --- Ventas --------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.REGISTRAR_VENTA)
  registrarVenta(@Payload() peticion: RegistrarVentaPeticion): Promise<DocumentoVenta> {
    return this.fachada.registrarVenta(peticion);
  }

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_VENTAS)
  listarVentas(@Payload() consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return this.fachada.listarVentas(consulta);
  }

  @MessagePattern(PATRONES_INVENTARIO.OBTENER_VENTA)
  obtenerVenta(@Payload() peticion: ObtenerVentaPeticion): Promise<DocumentoVenta> {
    return this.fachada.obtenerVenta(peticion);
  }

  /* --- Kardex --------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_KARDEX)
  listarKardex(@Payload() consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return this.fachada.listarKardex(consulta);
  }

  @MessagePattern(PATRONES_INVENTARIO.MOVIMIENTOS_PRODUCTO)
  movimientos(@Payload() peticion: MovimientosProductoPeticion): Promise<MovimientoProducto[]> {
    return this.fachada.movimientosDeProducto(peticion);
  }
}
