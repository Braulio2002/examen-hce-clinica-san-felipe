import { ErrorValidacion } from '@hce/compartido';

import type {
  MovimientoProducto,
  MovimientosProductoPeticion,
} from '../modelos/inventario.modelos';
import type { MovimientosProductoPuerto } from '../puertos/entrada/inventario.puertos';
import type { KardexRepositorio } from '../puertos/salida/inventario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: movimientos de un producto.
 *
 * Alimenta el modal que se abre desde cada fila del Kardex.
 */
export class MovimientosProductoCasoUso implements MovimientosProductoPuerto {
  constructor(private readonly repositorio: KardexRepositorio) {}

  ejecutar(peticion: MovimientosProductoPeticion): Promise<MovimientoProducto[]> {
    if (!Number.isInteger(peticion.idProducto) || peticion.idProducto <= 0) {
      throw new ErrorValidacion('El identificador de producto no es valido.');
    }
    return this.repositorio.movimientosDeProducto(
      peticion.idProducto,
      peticion.fechaDesde,
      peticion.fechaHasta,
    );
  }
}
