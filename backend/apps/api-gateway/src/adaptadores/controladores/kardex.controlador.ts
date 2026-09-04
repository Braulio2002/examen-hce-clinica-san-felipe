import { Controller, Get, Inject, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CLIENTES_MICROSERVICIO,
  enviarMensaje,
  PATRONES_INVENTARIO,
} from '@hce/compartido';

import {
  FilaKardexDto,
  ListarKardexDto,
  MovimientoRespuestaDto,
  MovimientosProductoDto,
} from '../dto/kardex.dto';

@ApiTags('Kardex')
@ApiBearerAuth()
@Controller('kardex')
export class KardexControlador {
  constructor(
    @Inject(CLIENTES_MICROSERVICIO.INVENTARIO)
    private readonly clienteInventario: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar Kardex',
    description:
      'Grilla principal del Kardex: Id_producto, nombre, stock actual, costo y precio ' +
      'de venta. El stock se deriva integramente de la tabla de movimientos, que es la ' +
      'unica fuente de verdad de la existencia fisica.',
  })
  @ApiOkResponse({ type: [FilaKardexDto] })
  listar(@Query() criterios: ListarKardexDto) {
    return enviarMensaje(
      this.clienteInventario,
      PATRONES_INVENTARIO.LISTAR_KARDEX,
      criterios,
    );
  }

  @Get('producto/:id/movimientos')
  @ApiOperation({
    summary: 'Movimientos de un producto',
    description:
      'Alimenta el modal que se abre desde cada fila del Kardex: fecha de registro, ' +
      'tipo de movimiento, cantidad y saldo acumulado.',
  })
  @ApiOkResponse({ type: [MovimientoRespuestaDto] })
  movimientos(
    @Param('id', ParseIntPipe) idProducto: number,
    @Query() filtro: MovimientosProductoDto,
  ) {
    return enviarMensaje(
      this.clienteInventario,
      PATRONES_INVENTARIO.MOVIMIENTOS_PRODUCTO,
      {
        idProducto,
        fechaDesde: filtro.fechaDesde,
        fechaHasta: filtro.fechaHasta,
      },
    );
  }
}
