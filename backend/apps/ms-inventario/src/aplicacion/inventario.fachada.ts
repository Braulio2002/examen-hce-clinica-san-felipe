import { Injectable } from '@nestjs/common';

import { ResultadoPaginado } from '@hce/compartido';

import {
  DocumentoCompra,
  DocumentoVenta,
  FilaKardex,
  LineaCompra,
  LineaVenta,
  MovimientoProducto,
  ResumenCompra,
  ResumenVenta,
} from '../dominio/entidades/inventario.entidades';
import { CriteriosKardex, FiltroPeriodo } from '../dominio/puertos/inventario.repositorio';
import {
  ListarComprasCasoUso,
  ListarKardexCasoUso,
  ListarVentasCasoUso,
  MovimientosProductoCasoUso,
  ObtenerCompraCasoUso,
  ObtenerVentaCasoUso,
  RegistrarCompraCasoUso,
  RegistrarVentaCasoUso,
} from './casos-uso/inventario.casos-uso';

/**
 * PATRON FACADE - subsistema de Inventario.
 *
 * Es el caso donde la fachada mas valor aporta: el subsistema tiene ocho casos
 * de uso repartidos en tres familias (compras, ventas, kardex) que comparten el
 * mismo agregado de stock. El controlador y, a traves del Gateway, el frontend
 * ven una superficie unica y estable.
 *
 * La fachada no decide reglas: si manana registrar una venta exigiera ademas
 * notificar a farmacia, eso seria un caso de uso nuevo que la fachada compone,
 * no un `if` dentro de este archivo.
 */
@Injectable()
export class InventarioFachada {
  constructor(
    private readonly registrarCompraCasoUso: RegistrarCompraCasoUso,
    private readonly listarComprasCasoUso: ListarComprasCasoUso,
    private readonly obtenerCompraCasoUso: ObtenerCompraCasoUso,
    private readonly registrarVentaCasoUso: RegistrarVentaCasoUso,
    private readonly listarVentasCasoUso: ListarVentasCasoUso,
    private readonly obtenerVentaCasoUso: ObtenerVentaCasoUso,
    private readonly listarKardexCasoUso: ListarKardexCasoUso,
    private readonly movimientosProductoCasoUso: MovimientosProductoCasoUso,
  ) {}

  // --- Compras ---------------------------------------------------------------
  registrarCompra(lineas: readonly LineaCompra[], usuarioApp?: string): Promise<DocumentoCompra> {
    return this.registrarCompraCasoUso.ejecutar(lineas, usuarioApp);
  }

  listarCompras(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return this.listarComprasCasoUso.ejecutar(filtro);
  }

  obtenerCompra(idCompraCab: number): Promise<DocumentoCompra> {
    return this.obtenerCompraCasoUso.ejecutar(idCompraCab);
  }

  // --- Ventas ----------------------------------------------------------------
  registrarVenta(lineas: readonly LineaVenta[], usuarioApp?: string): Promise<DocumentoVenta> {
    return this.registrarVentaCasoUso.ejecutar(lineas, usuarioApp);
  }

  listarVentas(filtro: FiltroPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return this.listarVentasCasoUso.ejecutar(filtro);
  }

  obtenerVenta(idVentaCab: number): Promise<DocumentoVenta> {
    return this.obtenerVentaCasoUso.ejecutar(idVentaCab);
  }

  // --- Kardex ----------------------------------------------------------------
  listarKardex(criterios: CriteriosKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return this.listarKardexCasoUso.ejecutar(criterios);
  }

  movimientosDeProducto(
    idProducto: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoProducto[]> {
    return this.movimientosProductoCasoUso.ejecutar(idProducto, fechaDesde, fechaHasta);
  }
}
