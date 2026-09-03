import { CasoUso, ResultadoPaginado } from '@hce/compartido';

import {
  ActualizarProductoPeticion,
  EliminarProductoPeticion,
  ListarProductosPeticion,
  ObtenerProductoPeticion,
  ProductoEliminadoRespuesta,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../modelos/producto.modelos';

/**
 * CAPA 2 · APLICACION — Puertos de entrada del catálogo.
 *
 * Un puerto por cada uno de los servicios que exige el enunciado. La fachada y
 * el controlador dependen de estas fronteras, no de las clases concretas.
 */
export type RegistrarProductoPuerto = CasoUso<RegistrarProductoPeticion, ProductoRespuesta>;
export const REGISTRAR_PRODUCTO_PUERTO = Symbol('REGISTRAR_PRODUCTO_PUERTO');

export type ActualizarProductoPuerto = CasoUso<ActualizarProductoPeticion, ProductoRespuesta>;
export const ACTUALIZAR_PRODUCTO_PUERTO = Symbol('ACTUALIZAR_PRODUCTO_PUERTO');

export type ListarProductosPuerto = CasoUso<
  ListarProductosPeticion,
  ResultadoPaginado<ProductoRespuesta>
>;
export const LISTAR_PRODUCTOS_PUERTO = Symbol('LISTAR_PRODUCTOS_PUERTO');

export type ObtenerProductoPuerto = CasoUso<ObtenerProductoPeticion, ProductoRespuesta>;
export const OBTENER_PRODUCTO_PUERTO = Symbol('OBTENER_PRODUCTO_PUERTO');

export type EliminarProductoPuerto = CasoUso<
  EliminarProductoPeticion,
  ProductoEliminadoRespuesta
>;
export const ELIMINAR_PRODUCTO_PUERTO = Symbol('ELIMINAR_PRODUCTO_PUERTO');
