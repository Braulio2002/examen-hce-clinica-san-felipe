import { Injectable } from '@nestjs/common';

import { ResultadoPaginado } from '@hce/compartido';

import { ProductoConStock } from '../dominio/entidades/producto.entidad';
import {
  CriteriosBusquedaProducto,
  DatosActualizacionProducto,
  DatosAltaProducto,
} from '../dominio/puertos/producto.repositorio';
import {
  ActualizarProductoCasoUso,
  EliminarProductoCasoUso,
  ListarProductosCasoUso,
  ObtenerProductoCasoUso,
  RegistrarProductoCasoUso,
} from './casos-uso/productos.casos-uso';

/**
 * PATRON FACADE - subsistema de Catalogo.
 *
 * Reune los cinco casos de uso del catalogo tras una interfaz simple. El
 * controlador TCP depende de una sola clase en lugar de cinco, y el orden y la
 * composicion de los casos de uso quedan encapsulados.
 */
@Injectable()
export class CatalogoFachada {
  constructor(
    private readonly registrarProducto: RegistrarProductoCasoUso,
    private readonly actualizarProducto: ActualizarProductoCasoUso,
    private readonly listarProductos: ListarProductosCasoUso,
    private readonly obtenerProducto: ObtenerProductoCasoUso,
    private readonly eliminarProducto: EliminarProductoCasoUso,
  ) {}

  registrar(datos: DatosAltaProducto): Promise<ProductoConStock> {
    return this.registrarProducto.ejecutar(datos);
  }

  actualizar(datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    return this.actualizarProducto.ejecutar(datos);
  }

  listar(criterios: CriteriosBusquedaProducto): Promise<ResultadoPaginado<ProductoConStock>> {
    return this.listarProductos.ejecutar(criterios);
  }

  obtener(idProducto: number): Promise<ProductoConStock> {
    return this.obtenerProducto.ejecutar(idProducto);
  }

  eliminar(idProducto: number, usuarioApp?: string): Promise<{ idProducto: number }> {
    return this.eliminarProducto.ejecutar(idProducto, usuarioApp);
  }
}
