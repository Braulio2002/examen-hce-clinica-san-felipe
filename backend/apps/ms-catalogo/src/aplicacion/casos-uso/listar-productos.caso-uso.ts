import { normalizarPaginacion, type ResultadoPaginado } from '@hce/compartido';

import type {
  ListarProductosPeticion,
  ProductoRespuesta,
} from '../modelos/producto.modelos';
import type { ListarProductosPuerto } from '../puertos/entrada/catalogo.puertos';
import type { ProductoRepositorio } from '../puertos/salida/producto.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: Listar Producto.
 *
 * Normaliza la paginación antes de llegar al repositorio. Hacerlo aquí y no en
 * el controlador significa que la protección contra "dame cien mil registros"
 * aplica sea cual sea el transporte por el que entre la petición.
 */
export class ListarProductosCasoUso implements ListarProductosPuerto {
  constructor(private readonly repositorio: ProductoRepositorio) {}

  ejecutar(
    peticion: ListarProductosPeticion,
  ): Promise<ResultadoPaginado<ProductoRespuesta>> {
    const { pagina, tamanoPagina } = normalizarPaginacion(peticion);
    return this.repositorio.listar({ ...peticion, pagina, tamanoPagina });
  }
}
