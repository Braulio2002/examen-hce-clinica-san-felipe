import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CLIENTES_MICROSERVICIO, enviarMensaje, PATRONES_INVENTARIO } from '@hce/compartido';

import { Roles } from '../../seguridad/decoradores/roles.decorador';
import { UsuarioActual } from '../../seguridad/decoradores/usuario-actual.decorador';
import { UsuarioAutenticado } from '../../seguridad/estrategias/jwt.estrategia';
import { CompraRespuestaDto, ListarComprasDto, RegistrarCompraDto } from './dto/compra.dto';

@ApiTags('Compras')
@ApiBearerAuth()
@Controller('compras')
export class ComprasControlador {
  constructor(
    @Inject(CLIENTES_MICROSERVICIO.INVENTARIO) private readonly clienteInventario: ClientProxy,
  ) {}

  @Post()
  @Roles('ADMIN', 'FARMACIA')
  @ApiOperation({
    summary: 'Registrar Compra',
    description:
      'Operacion atomica: graba CompraCab y CompraDet, actualiza el costo y el precio ' +
      'de venta del producto (PrecioVenta = Costo * 1.35) y genera el movimiento de ' +
      'tipo Entrada en el Kardex. Si cualquier paso falla, no se graba nada.',
  })
  @ApiCreatedResponse({ type: CompraRespuestaDto })
  registrar(
    @Body() datos: RegistrarCompraDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<CompraRespuestaDto> {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.REGISTRAR_COMPRA, {
      lineas: datos.lineas,
      usuarioApp: usuario.username,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Listar Compra', description: 'Listado paginado por rango de fechas.' })
  listar(@Query() filtro: ListarComprasDto) {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.LISTAR_COMPRAS, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el detalle completo de una compra' })
  @ApiNotFoundResponse({ description: 'La compra no existe' })
  obtener(@Param('id', ParseIntPipe) idCompraCab: number): Promise<CompraRespuestaDto> {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.OBTENER_COMPRA, {
      idCompraCab,
    });
  }
}
