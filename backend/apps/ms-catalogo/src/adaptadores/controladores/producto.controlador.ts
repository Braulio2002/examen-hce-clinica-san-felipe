import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_CATALOGO, ResultadoPaginado } from '@hce/compartido';

import { CatalogoFachada } from '../../aplicacion/fachadas/catalogo.fachada';
import {
  ActualizarProductoPeticion,
  EliminarProductoPeticion,
  ListarProductosPeticion,
  ObtenerProductoPeticion,
  ProductoEliminadoRespuesta,
  ProductoRespuesta,
  RegistrarProductoPeticion,
} from '../../aplicacion/modelos/producto.modelos';

export const CATALOGO_FACHADA = Symbol('CATALOGO_FACHADA');

/** CAPA 3 · ADAPTADORES — Controlador de transporte TCP del catálogo. */
@Controller()
export class ProductoControlador {
  constructor(@Inject(CATALOGO_FACHADA) private readonly fachada: CatalogoFachada) {}

  @MessagePattern(PATRONES_CATALOGO.REGISTRAR_PRODUCTO)
  registrar(@Payload() peticion: RegistrarProductoPeticion): Promise<ProductoRespuesta> {
    return this.fachada.registrar(peticion);
  }

  @MessagePattern(PATRONES_CATALOGO.ACTUALIZAR_PRODUCTO)
  actualizar(@Payload() peticion: ActualizarProductoPeticion): Promise<ProductoRespuesta> {
    return this.fachada.actualizar(peticion);
  }

  @MessagePattern(PATRONES_CATALOGO.LISTAR_PRODUCTOS)
  listar(
    @Payload() peticion: ListarProductosPeticion,
  ): Promise<ResultadoPaginado<ProductoRespuesta>> {
    return this.fachada.listar(peticion);
  }

  @MessagePattern(PATRONES_CATALOGO.OBTENER_PRODUCTO)
  obtener(@Payload() peticion: ObtenerProductoPeticion): Promise<ProductoRespuesta> {
    return this.fachada.obtener(peticion);
  }

  @MessagePattern(PATRONES_CATALOGO.ELIMINAR_PRODUCTO)
  eliminar(
    @Payload() peticion: EliminarProductoPeticion,
  ): Promise<ProductoEliminadoRespuesta> {
    return this.fachada.eliminar(peticion);
  }
}
