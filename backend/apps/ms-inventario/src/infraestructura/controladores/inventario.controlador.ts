import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_INVENTARIO, ResultadoPaginado } from '@hce/compartido';

import { InventarioFachada } from '../../aplicacion/inventario.fachada';
import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaVenta,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../../dominio/entidades/inventario.entidades';
import { CriteriosKardex, FiltroPeriodo } from '../../dominio/puertos/inventario.repositorio';

/** Adaptador de entrada TCP del microservicio de inventario. */
@Controller()
export class InventarioControlador {
  constructor(private readonly fachada: InventarioFachada) {}

  /* --- Compras ------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.REGISTRAR_COMPRA)
  registrarCompra(
    @Payload() payload: { lineas: LineaCompra[]; usuarioApp?: string },
  ): Promise<DocumentoCompra> {
    return this.fachada.registrarCompra(payload.lineas, payload.usuarioApp);
  }

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_COMPRAS)
  listarCompras(@Payload() filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return this.fachada.listarCompras(filtro);
  }

  @MessagePattern(PATRONES_INVENTARIO.OBTENER_COMPRA)
  obtenerCompra(@Payload() payload: { idCompraCab: number }): Promise<DocumentoCompra> {
    return this.fachada.obtenerCompra(payload.idCompraCab);
  }

  /* --- Ventas -------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.REGISTRAR_VENTA)
  registrarVenta(
    @Payload() payload: { lineas: LineaVenta[]; usuarioApp?: string },
  ): Promise<DocumentoVenta> {
    return this.fachada.registrarVenta(payload.lineas, payload.usuarioApp);
  }

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_VENTAS)
  listarVentas(@Payload() filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return this.fachada.listarVentas(filtro);
  }

  @MessagePattern(PATRONES_INVENTARIO.OBTENER_VENTA)
  obtenerVenta(@Payload() payload: { idVentaCab: number }): Promise<DocumentoVenta> {
    return this.fachada.obtenerVenta(payload.idVentaCab);
  }

  /* --- Kardex -------------------------------------------------------------- */

  @MessagePattern(PATRONES_INVENTARIO.LISTAR_KARDEX)
  listarKardex(@Payload() criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return this.fachada.listarKardex(criterios);
  }

  @MessagePattern(PATRONES_INVENTARIO.MOVIMIENTOS_PRODUCTO)
  movimientos(
    @Payload() payload: { idProducto: number; fechaDesde?: string; fechaHasta?: string },
  ): Promise<MovimientoProducto[]> {
    return this.fachada.movimientosDeProducto(
      payload.idProducto,
      payload.fechaDesde,
      payload.fechaHasta,
    );
  }
}
