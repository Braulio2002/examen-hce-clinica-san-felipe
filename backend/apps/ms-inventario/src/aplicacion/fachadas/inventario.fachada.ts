import type { ResultadoPaginado } from '@hce/compartido';

import type {
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
} from '../modelos/inventario.modelos';
import type {
  ListarComprasPuerto,
  ListarKardexPuerto,
  ListarVentasPuerto,
  MovimientosProductoPuerto,
  ObtenerCompraPuerto,
  ObtenerVentaPuerto,
  RegistrarCompraPuerto,
  RegistrarVentaPuerto,
} from '../puertos/entrada/inventario.puertos';

/**
 * CAPA 2 · APLICACION — PATRON FACADE del subsistema de Inventario.
 *
 * Es el caso donde la fachada más valor aporta: el subsistema tiene ocho casos
 * de uso repartidos en tres familias (compras, ventas y Kardex) que comparten
 * el mismo agregado de stock. El controlador y, a través del Gateway, el
 * FrontEnd ven una superficie única y estable.
 *
 * La fachada depende de los PUERTOS de entrada, no de las clases concretas:
 * respeta la misma regla de dependencia que el resto de la capa.
 *
 * No decide reglas. Si mañana registrar una venta exigiera además notificar a
 * farmacia, eso sería un caso de uso nuevo que la fachada compone, no un `if`
 * dentro de este archivo.
 */
export class InventarioFachada {
  constructor(
    private readonly registrarCompraCasoUso: RegistrarCompraPuerto,
    private readonly listarComprasCasoUso: ListarComprasPuerto,
    private readonly obtenerCompraCasoUso: ObtenerCompraPuerto,
    private readonly registrarVentaCasoUso: RegistrarVentaPuerto,
    private readonly listarVentasCasoUso: ListarVentasPuerto,
    private readonly obtenerVentaCasoUso: ObtenerVentaPuerto,
    private readonly listarKardexCasoUso: ListarKardexPuerto,
    private readonly movimientosProductoCasoUso: MovimientosProductoPuerto,
  ) {}

  /* --- Compras -------------------------------------------------------------- */

  registrarCompra(peticion: RegistrarCompraPeticion): Promise<DocumentoCompra> {
    return this.registrarCompraCasoUso.ejecutar(peticion);
  }

  listarCompras(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenCompra>> {
    return this.listarComprasCasoUso.ejecutar(consulta);
  }

  obtenerCompra(peticion: ObtenerCompraPeticion): Promise<DocumentoCompra> {
    return this.obtenerCompraCasoUso.ejecutar(peticion);
  }

  /* --- Ventas --------------------------------------------------------------- */

  registrarVenta(peticion: RegistrarVentaPeticion): Promise<DocumentoVenta> {
    return this.registrarVentaCasoUso.ejecutar(peticion);
  }

  listarVentas(consulta: ConsultaPeriodo): Promise<ResultadoPaginado<ResumenVenta>> {
    return this.listarVentasCasoUso.ejecutar(consulta);
  }

  obtenerVenta(peticion: ObtenerVentaPeticion): Promise<DocumentoVenta> {
    return this.obtenerVentaCasoUso.ejecutar(peticion);
  }

  /* --- Kardex --------------------------------------------------------------- */

  listarKardex(consulta: ConsultaKardex): Promise<ResultadoPaginado<FilaKardex>> {
    return this.listarKardexCasoUso.ejecutar(consulta);
  }

  movimientosDeProducto(
    peticion: MovimientosProductoPeticion,
  ): Promise<MovimientoProducto[]> {
    return this.movimientosProductoCasoUso.ejecutar(peticion);
  }
}
