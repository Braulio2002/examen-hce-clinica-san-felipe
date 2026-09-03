import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { CLIENTES_MICROSERVICIO, enviarMensaje, PATRONES_INVENTARIO } from '@hce/compartido';

import { Roles } from '../../seguridad/decoradores/roles.decorador';
import { UsuarioActual } from '../../seguridad/decoradores/usuario-actual.decorador';
import { UsuarioAutenticado } from '../../seguridad/estrategias/jwt.estrategia';
import { ListarVentasDto, RegistrarVentaDto, VentaRespuestaDto } from './dto/venta.dto';

@ApiTags('Ventas')
@ApiBearerAuth()
@Controller('ventas')
export class VentasControlador {
  constructor(
    @Inject(CLIENTES_MICROSERVICIO.INVENTARIO) private readonly clienteInventario: ClientProxy,
  ) {}

  @Post()
  @Roles('ADMIN', 'FARMACIA')
  @ApiOperation({
    summary: 'Registrar Venta',
    description:
      'Valida contra el stock disponible antes de grabar. Los importes se calculan en ' +
      'el servidor con el precio vigente del catalogo. Genera el movimiento de tipo ' +
      'Salida en el Kardex dentro de la misma transaccion.',
  })
  @ApiCreatedResponse({ type: VentaRespuestaDto })
  @ApiUnprocessableEntityResponse({
    description: 'La cantidad solicitada supera el stock disponible de algun producto',
  })
  registrar(
    @Body() datos: RegistrarVentaDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<VentaRespuestaDto> {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.REGISTRAR_VENTA, {
      lineas: datos.lineas,
      usuarioApp: usuario.username,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Listar Venta', description: 'Listado paginado por rango de fechas.' })
  listar(@Query() filtro: ListarVentasDto) {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.LISTAR_VENTAS, filtro);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener el detalle completo de una venta' })
  @ApiNotFoundResponse({ description: 'La venta no existe' })
  obtener(@Param('id', ParseIntPipe) idVentaCab: number): Promise<VentaRespuestaDto> {
    return enviarMensaje(this.clienteInventario, PATRONES_INVENTARIO.OBTENER_VENTA, {
      idVentaCab,
    });
  }
}
