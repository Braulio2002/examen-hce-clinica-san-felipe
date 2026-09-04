import { ErrorNoEncontrado } from '@hce/compartido';

import type { DocumentoVenta, ObtenerVentaPeticion } from '../modelos/inventario.modelos';
import type { ObtenerVentaPuerto } from '../puertos/entrada/inventario.puertos';
import type { VentaRepositorio } from '../puertos/salida/inventario.repositorio';

/** CAPA 2 · APLICACION — Caso de uso: obtener el detalle de una venta. */
export class ObtenerVentaCasoUso implements ObtenerVentaPuerto {
  constructor(private readonly repositorio: VentaRepositorio) {}

  async ejecutar(peticion: ObtenerVentaPeticion): Promise<DocumentoVenta> {
    const venta = await this.repositorio.obtenerVenta(peticion.idVentaCab);
    if (!venta) throw new ErrorNoEncontrado('Venta', peticion.idVentaCab);
    return venta;
  }
}
