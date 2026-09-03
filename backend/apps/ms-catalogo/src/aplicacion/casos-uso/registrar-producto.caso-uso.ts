import { ErrorValidacion } from '@hce/compartido';

import { Producto } from '../../dominio/entidades/producto.entidad';
import { ProductoRespuesta, RegistrarProductoPeticion } from '../modelos/producto.modelos';
import { RegistrarProductoPuerto } from '../puertos/entrada/catalogo.puertos';
import { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Registrar Producto.
 *
 * Única razón de cambio: la política de alta de un insumo. Si mañana cambia la
 * regla del precio sugerido, se toca este archivo y ninguno más.
 */
export class RegistrarProductoCasoUso implements RegistrarProductoPuerto {
  constructor(private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    try {
      // La validación de invariantes vive en la ENTIDAD, no aquí: el caso de
      // uso orquesta, el dominio decide qué es un producto válido.
      Producto.validarAlta(peticion.nombreProducto, peticion.nroLote, peticion.costo);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    // Si no se indica precio de venta, se aplica la regla Costo * 1.35.
    const precioVenta = peticion.precioVenta ?? Producto.precioSugerido(peticion.costo);

    return this.repositorio.registrar({ ...peticion, precioVenta });
  }
}
