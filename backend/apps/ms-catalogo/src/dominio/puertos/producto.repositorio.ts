import { ResultadoPaginado } from '@hce/compartido';

import { ProductoConStock } from '../entidades/producto.entidad';

export interface DatosAltaProducto {
  readonly nombreProducto: string;
  readonly nroLote: string;
  readonly costo: number;
  readonly precioVenta?: number;
  readonly usuarioApp?: string;
}

export interface DatosActualizacionProducto {
  readonly idProducto: number;
  readonly nombreProducto?: string;
  readonly nroLote?: string;
  readonly costo?: number;
  readonly precioVenta?: number;
  readonly usuarioApp?: string;
}

export interface CriteriosBusquedaProducto {
  readonly buscar?: string;
  readonly soloConStock?: boolean;
  readonly pagina: number;
  readonly tamanoPagina: number;
}

/**
 * Puerto de salida del catalogo.
 *
 * Define el contrato completo de persistencia de productos. Los casos de uso
 * dependen solo de esta interfaz; la implementacion contra SQL Server y sus
 * decoradores se resuelven en el modulo.
 */
export interface ProductoRepositorio {
  registrar(datos: DatosAltaProducto): Promise<ProductoConStock>;
  actualizar(datos: DatosActualizacionProducto): Promise<ProductoConStock>;
  listar(criterios: CriteriosBusquedaProducto): Promise<ResultadoPaginado<ProductoConStock>>;
  obtener(idProducto: number): Promise<ProductoConStock | null>;
  eliminar(idProducto: number, usuarioApp?: string): Promise<void>;
}

export const PRODUCTO_REPOSITORIO = Symbol('PRODUCTO_REPOSITORIO');
