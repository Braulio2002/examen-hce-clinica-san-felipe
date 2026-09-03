import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_CATALOGO, ResultadoPaginado } from '@hce/compartido';

import { CatalogoFachada } from '../../aplicacion/catalogo.fachada';
import { ProductoConStock } from '../../dominio/entidades/producto.entidad';
import {
  CriteriosBusquedaProducto,
  DatosActualizacionProducto,
  DatosAltaProducto,
} from '../../dominio/puertos/producto.repositorio';

/** Adaptador de entrada TCP del microservicio de catalogo. */
@Controller()
export class ProductoControlador {
  constructor(private readonly fachada: CatalogoFachada) {}

  @MessagePattern(PATRONES_CATALOGO.REGISTRAR_PRODUCTO)
  registrar(@Payload() datos: DatosAltaProducto): Promise<ProductoConStock> {
    return this.fachada.registrar(datos);
  }

  @MessagePattern(PATRONES_CATALOGO.ACTUALIZAR_PRODUCTO)
  actualizar(@Payload() datos: DatosActualizacionProducto): Promise<ProductoConStock> {
    return this.fachada.actualizar(datos);
  }

  @MessagePattern(PATRONES_CATALOGO.LISTAR_PRODUCTOS)
  listar(
    @Payload() criterios: CriteriosBusquedaProducto,
  ): Promise<ResultadoPaginado<ProductoConStock>> {
    return this.fachada.listar(criterios);
  }

  @MessagePattern(PATRONES_CATALOGO.OBTENER_PRODUCTO)
  obtener(@Payload() payload: { idProducto: number }): Promise<ProductoConStock> {
    return this.fachada.obtener(payload.idProducto);
  }

  @MessagePattern(PATRONES_CATALOGO.ELIMINAR_PRODUCTO)
  eliminar(
    @Payload() payload: { idProducto: number; usuarioApp?: string },
  ): Promise<{ idProducto: number }> {
    return this.fachada.eliminar(payload.idProducto, payload.usuarioApp);
  }
}
