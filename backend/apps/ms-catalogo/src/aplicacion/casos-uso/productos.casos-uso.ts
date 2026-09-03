import { Inject, Injectable } from '@nestjs/common';

import { ErrorNoEncontrado, ErrorValidacion, ResultadoPaginado } from '@hce/compartido';

import { Producto, ProductoConStock } from '../../dominio/entidades/producto.entidad';
import {
  CriteriosBusquedaProducto,
  DatosActualizacionProducto,
  DatosAltaProducto,
  PRODUCTO_REPOSITORIO,
  ProductoRepositorio,
} from '../../dominio/puertos/producto.repositorio';

/**
 * Casos de uso del catalogo de insumos medicos.
 *
 * Cada clase tiene una unica razon de cambio (SRP): si cambia la regla de alta
 * no se toca la de listado. Todas dependen del puerto ProductoRepositorio y no
 * de SQL Server (DIP), por lo que se prueban con un doble en memoria.
 */

/** Registrar Producto. */
@Injectable()
export class RegistrarProductoCasoUso {
  constructor(@Inject(PRODUCTO_REPOSITORIO) private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(datos: DatosAltaProducto): Promise<ProductoConStock> {
    try {
      Producto.validarAlta(datos.nombreProducto, datos.nroLote, datos.costo);
    } catch (error) {
      throw new ErrorValidacion((error as Error).message);
    }

    // Si no se indica precio de venta, se aplica la regla Costo * 1.35.
    const precioVenta = datos.precioVenta ?? Producto.precioSugerido(datos.costo);

    return this.repositorio.registrar({ ...datos, precioVenta });
  }
}

/** Actualizar Producto. */
@Injectable()
export class ActualizarProductoCasoUso {
  constructor(@Inject(PRODUCTO_REPOSITORIO) private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    const hayCambios =
      datos.nombreProducto !== undefined ||
      datos.nroLote !== undefined ||
      datos.costo !== undefined ||
      datos.precioVenta !== undefined;

    if (!hayCambios) {
      throw new ErrorValidacion('Debe indicar al menos un campo a actualizar.');
    }
    if (datos.costo !== undefined && datos.costo < 0) {
      throw new ErrorValidacion('El costo no puede ser negativo.');
    }
    if (datos.precioVenta !== undefined && datos.precioVenta < 0) {
      throw new ErrorValidacion('El precio de venta no puede ser negativo.');
    }

    /*
     * Si se actualiza el costo sin indicar precio, se recalcula el precio para
     * no dejar el catalogo con un margen inconsistente. Es la misma regla que
     * aplica la compra.
     */
    const precioVenta =
      datos.precioVenta ??
      (datos.costo !== undefined ? Producto.precioSugerido(datos.costo) : undefined);

    return this.repositorio.actualizar({ ...datos, precioVenta });
  }
}

/** Listar Producto. */
@Injectable()
export class ListarProductosCasoUso {
  constructor(@Inject(PRODUCTO_REPOSITORIO) private readonly repositorio: ProductoRepositorio) {}

  ejecutar(criterios: CriteriosBusquedaProducto): Promise<ResultadoPaginado<ProductoConStock>> {
    return this.repositorio.listar(criterios);
  }
}

/** Obtener un producto por identificador. */
@Injectable()
export class ObtenerProductoCasoUso {
  constructor(@Inject(PRODUCTO_REPOSITORIO) private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(idProducto: number): Promise<ProductoConStock> {
    const producto = await this.repositorio.obtener(idProducto);
    if (!producto) {
      throw new ErrorNoEncontrado('Producto', idProducto);
    }
    return producto;
  }
}

/** Eliminar Producto (baja logica). */
@Injectable()
export class EliminarProductoCasoUso {
  constructor(@Inject(PRODUCTO_REPOSITORIO) private readonly repositorio: ProductoRepositorio) {}

  async ejecutar(idProducto: number, usuarioApp?: string): Promise<{ idProducto: number }> {
    await this.repositorio.eliminar(idProducto, usuarioApp);
    return { idProducto };
  }
}
