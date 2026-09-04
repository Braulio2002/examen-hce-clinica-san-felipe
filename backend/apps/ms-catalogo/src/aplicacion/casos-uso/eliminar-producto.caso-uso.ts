import { ErrorValidacion } from '@hce/compartido';

import type {
  EliminarProductoPeticion,
  ProductoEliminadoRespuesta,
} from '../modelos/producto.modelos';
import type { EliminarProductoPuerto } from '../puertos/entrada/catalogo.puertos';
import type { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: eliminar producto (baja lógica).
 *
 * En un entorno clínico un producto referenciado por movimientos históricos
 * nunca debe desaparecer físicamente, por trazabilidad sanitaria. El
 * procedimiento almacenado rechaza además la baja si aún tiene stock.
 */
export class EliminarProductoCasoUso implements EliminarProductoPuerto {
  constructor(private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(
    peticion: EliminarProductoPeticion,
  ): Promise<ProductoEliminadoRespuesta> {
    if (!Number.isInteger(peticion.idProducto) || peticion.idProducto <= 0) {
      throw new ErrorValidacion('El identificador de producto no es valido.');
    }

    await this.repositorio.eliminar(peticion.idProducto, peticion.usuarioApp);
    return { idProducto: peticion.idProducto };
  }
}
