import { ResultadoPaginado } from '@hce/compartido';

import {
  ActualizarProductoPeticion,
  ListarProductosPeticion,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../modelos/producto.modelos';

/**
 * CAPA 2 · APLICACION — Puerto de salida del catálogo.
 *
 * Define el contrato completo de persistencia de productos. Los casos de uso
 * dependen solo de esta interfaz; la pasarela contra SQL Server y sus
 * decoradores se resuelven en la raíz de composición.
 */
export interface ProductoRepositorio {
  registrar(peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta>;
  actualizar(peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta>;
  listar(peticion: ListarProductosPeticion): Promise<ResultadoPaginado<ProductoRespuesta>>;
  obtener(idProducto: number): Promise<ProductoRespuesta | null>;
  eliminar(idProducto: number, usuarioApp?: string): Promise<void>;
}

export const PRODUCTO_REPOSITORIO = Symbol('PRODUCTO_REPOSITORIO');
