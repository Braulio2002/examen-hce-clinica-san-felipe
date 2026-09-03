import { ErrorValidacion } from '@hce/compartido';

import { Producto } from '../../dominio/entidades/producto.entidad';
import { ActualizarProductoPeticion, ProductoRespuesta } from '../modelos/producto.modelos';
import { ActualizarProductoPuerto } from '../puertos/entrada/catalogo.puertos';
import { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Actualizar Producto.
 *
 * Actualización parcial: solo se envían los campos que cambian.
 */
export class ActualizarProductoCasoUso implements ActualizarProductoPuerto {
  constructor(private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    const hayCambios =
      peticion.nombreProducto !== undefined ||
      peticion.nroLote !== undefined ||
      peticion.costo !== undefined ||
      peticion.precioVenta !== undefined;

    if (!hayCambios) {
      throw new ErrorValidacion('Debe indicar al menos un campo a actualizar.');
    }
    if (peticion.costo !== undefined && peticion.costo < 0) {
      throw new ErrorValidacion('El costo no puede ser negativo.');
    }
    if (peticion.precioVenta !== undefined && peticion.precioVenta < 0) {
      throw new ErrorValidacion('El precio de venta no puede ser negativo.');
    }

    /*
     * Si se actualiza el costo sin indicar precio, se recalcula el precio para
     * no dejar el catálogo con un margen inconsistente. Es la misma regla que
     * aplica el registro de una compra.
     */
    const precioVenta =
      peticion.precioVenta ??
      (peticion.costo !== undefined ? Producto.precioSugerido(peticion.costo) : undefined);

    return this.repositorio.actualizar({ ...peticion, precioVenta });
  }
}
