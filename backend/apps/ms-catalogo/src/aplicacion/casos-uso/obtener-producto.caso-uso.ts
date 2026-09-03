import { ErrorNoEncontrado, ErrorValidacion } from '@hce/compartido';

import { ObtenerProductoPeticion, ProductoRespuesta } from '../modelos/producto.modelos';
import { ObtenerProductoPuerto } from '../puertos/entrada/catalogo.puertos';
import { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

/** CAPA 2 · APLICACION — Caso de uso: obtener un producto por identificador. */
export class ObtenerProductoCasoUso implements ObtenerProductoPuerto {
  constructor(private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(peticion: ObtenerProductoPeticion): Promise<ProductoRespuesta> {
    if (!Number.isInteger(peticion.idProducto) || peticion.idProducto <= 0) {
      throw new ErrorValidacion('El identificador de producto no es valido.');
    }

    const producto = await this.repositorio.obtener(peticion.idProducto);
    if (!producto) {
      throw new ErrorNoEncontrado('Producto', peticion.idProducto);
    }
    return producto;
  }
}
