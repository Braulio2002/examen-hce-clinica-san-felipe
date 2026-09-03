import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

import { PaginacionBusquedaDto } from '@hce/compartido';

export class ListarKardexDto extends PaginacionBusquedaDto {}

export class MovimientosProductoDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaDesde debe tener formato AAAA-MM-DD.' })
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaHasta debe tener formato AAAA-MM-DD.' })
  fechaHasta?: string;
}

export class FilaKardexDto {
  @ApiProperty({ example: 1 }) idProducto!: number;
  @ApiProperty({ example: 'Paracetamol 500 mg Tableta' }) nombreProducto!: string;
  @ApiProperty({ example: 'LT-2026-0001' }) nroLote!: string;
  @ApiProperty({ example: 680 }) stockActual!: number;
  @ApiProperty({ example: 0.49 }) costo!: number;
  @ApiProperty({ example: 0.6615 }) precioVenta!: number;
  @ApiProperty({ example: 333.2, description: 'Stock valorizado al costo' })
  valorizado!: number;
}

export class MovimientoRespuestaDto {
  @ApiProperty() idMovimientoDet!: number;
  @ApiProperty({ example: '2026-09-03T08:46:53.000Z' }) fechaRegistro!: Date;
  @ApiProperty({ example: 'Entrada', enum: ['Entrada', 'Salida'] }) tipoMovimiento!: string;
  @ApiProperty({ example: 1, description: '(1) Entrada, (2) Salida' })
  idTipoMovimiento!: number;
  @ApiProperty({ description: 'Id_CompraCab o Id_VentaCab segun el tipo' })
  documentoOrigen!: number;
  @ApiProperty({ example: 100 }) cantidad!: number;
  @ApiProperty({ example: 680, description: 'Saldo acumulado tras el movimiento' })
  saldo!: number;
}
