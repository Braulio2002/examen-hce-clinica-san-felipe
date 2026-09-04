import { ErrorNoEncontrado } from '@hce/compartido';

import type {
  DocumentoCompra,
  ObtenerCompraPeticion,
} from '../modelos/inventario.modelos';
import type { ObtenerCompraPuerto } from '../puertos/entrada/inventario.puertos';
import type { CompraRepositorio } from '../puertos/salida/inventario.repositorio';

/** CAPA 2 · APLICACION — Caso de uso: obtener el detalle de una compra. */
export class ObtenerCompraCasoUso implements ObtenerCompraPuerto {
  constructor(private readonly repositorio: CompraRepositorio) {}

  async ejecutar(peticion: ObtenerCompraPeticion): Promise<DocumentoCompra> {
    const compra = await this.repositorio.obtenerCompra(peticion.idCompraCab);
    if (!compra) throw new ErrorNoEncontrado('Compra', peticion.idCompraCab);
    return compra;
  }
}
