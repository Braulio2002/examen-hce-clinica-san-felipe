import type { ResultadoPaginado } from '@hce/compartido';

import type {
  ActualizarProductoPeticion,
  EliminarProductoPeticion,
  ListarProductosPeticion,
  ObtenerProductoPeticion,
  ProductoEliminadoRespuesta,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../modelos/producto.modelos';
import type {
  ActualizarProductoPuerto,
  EliminarProductoPuerto,
  ListarProductosPuerto,
  ObtenerProductoPuerto,
  RegistrarProductoPuerto,
} from '../puertos/entrada/catalogo.puertos';

/**
 * CAPA 2 · APLICACION — PATRON FACADE del subsistema de Catálogo.
 *
 * Reúne los cinco casos de uso tras una interfaz simple. El controlador depende
 * de una sola clase en lugar de cinco, y la composición interna del subsistema
 * queda encapsulada.
 */
export class CatalogoFachada {
  constructor(
    private readonly registrarProducto: RegistrarProductoPuerto,
    private readonly actualizarProducto: ActualizarProductoPuerto,
    private readonly listarProductos: ListarProductosPuerto,
    private readonly obtenerProducto: ObtenerProductoPuerto,
    private readonly eliminarProducto: EliminarProductoPuerto,
  ) {}

  registrar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    return this.registrarProducto.ejecutar(peticion);
  }

  actualizar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    return this.actualizarProducto.ejecutar(peticion);
  }

  listar(
    peticion: ListarProductosPeticion,
  ): Promise<ResultadoPaginado<ProductoRespuesta>> {
    return this.listarProductos.ejecutar(peticion);
  }

  obtener(peticion: ObtenerProductoPeticion): Promise<ProductoRespuesta> {
    return this.obtenerProducto.ejecutar(peticion);
  }

  eliminar(peticion: EliminarProductoPeticion): Promise<ProductoEliminadoRespuesta> {
    return this.eliminarProducto.ejecutar(peticion);
  }
}
