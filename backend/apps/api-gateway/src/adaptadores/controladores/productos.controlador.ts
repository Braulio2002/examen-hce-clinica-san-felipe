import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CLIENTES_MICROSERVICIO, enviarMensaje, PATRONES_CATALOGO } from '@hce/compartido';

import { Roles } from '../seguridad/decoradores/roles.decorador';
import { UsuarioActual } from '../seguridad/decoradores/usuario-actual.decorador';
import { UsuarioAutenticado } from '../seguridad/estrategias/jwt.estrategia';
import {
  ActualizarProductoDto,
  CrearProductoDto,
  ListarProductosDto,
  ProductoRespuestaDto,
} from '../dto/producto.dto';

/**
 * Enrutamiento HTTP del catalogo de insumos medicos.
 *
 * El controlador no contiene logica: valida la entrada con los DTO, propaga el
 * usuario autenticado para la auditoria y delega en el microservicio de
 * catalogo. Es un adaptador de transporte, nada mas.
 */
@ApiTags('Productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosControlador {
  constructor(
    @Inject(CLIENTES_MICROSERVICIO.CATALOGO) private readonly clienteCatalogo: ClientProxy,
  ) {}

  @Post()
  @Roles('ADMIN', 'FARMACIA')
  @ApiOperation({
    summary: 'Registrar Producto',
    description:
      'Da de alta un medicamento o insumo. Si no se envia precioVenta, se calcula ' +
      'como Costo * 1.35. Es la operacion que respalda el modal "Registrar producto" ' +
      'de la pantalla de compras.',
  })
  @ApiCreatedResponse({ type: ProductoRespuestaDto })
  @ApiConflictResponse({ description: 'Ya existe un producto con el mismo nombre y lote' })
  registrar(
    @Body() datos: CrearProductoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ProductoRespuestaDto> {
    return enviarMensaje(this.clienteCatalogo, PATRONES_CATALOGO.REGISTRAR_PRODUCTO, {
      ...datos,
      usuarioApp: usuario.username,
    });
  }

  @Patch(':id')
  @Roles('ADMIN', 'FARMACIA')
  @ApiOperation({
    summary: 'Actualizar Producto',
    description:
      'Actualizacion parcial. Si se envia costo sin precioVenta, el precio se recalcula ' +
      'para no dejar el catalogo con un margen inconsistente.',
  })
  @ApiOkResponse({ type: ProductoRespuestaDto })
  @ApiNotFoundResponse({ description: 'El producto no existe o esta inactivo' })
  actualizar(
    @Param('id', ParseIntPipe) idProducto: number,
    @Body() datos: ActualizarProductoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<ProductoRespuestaDto> {
    return enviarMensaje(this.clienteCatalogo, PATRONES_CATALOGO.ACTUALIZAR_PRODUCTO, {
      idProducto,
      ...datos,
      usuarioApp: usuario.username,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'Listar Producto',
    description:
      'Listado paginado con busqueda por nombre o lote. Incluye el stock disponible, ' +
      'calculado desde la tabla de movimientos.',
  })
  listar(@Query() criterios: ListarProductosDto) {
    return enviarMensaje(this.clienteCatalogo, PATRONES_CATALOGO.LISTAR_PRODUCTOS, criterios);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por identificador' })
  @ApiOkResponse({ type: ProductoRespuestaDto })
  @ApiNotFoundResponse({ description: 'El producto no existe' })
  obtener(@Param('id', ParseIntPipe) idProducto: number): Promise<ProductoRespuestaDto> {
    return enviarMensaje(this.clienteCatalogo, PATRONES_CATALOGO.OBTENER_PRODUCTO, {
      idProducto,
    });
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Desactivar un producto (baja logica)',
    description:
      'No borra fisicamente: marca el producto como inactivo para preservar la ' +
      'trazabilidad de los movimientos historicos. Se rechaza si aun tiene stock.',
  })
  @ApiConflictResponse({ description: 'El producto todavia tiene stock disponible' })
  eliminar(
    @Param('id', ParseIntPipe) idProducto: number,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return enviarMensaje(this.clienteCatalogo, PATRONES_CATALOGO.ELIMINAR_PRODUCTO, {
      idProducto,
      usuarioApp: usuario.username,
    });
  }
}
