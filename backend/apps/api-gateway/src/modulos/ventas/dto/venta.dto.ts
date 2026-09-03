import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginacionDto } from '@hce/compartido';

export class LineaVentaDto {
  @ApiProperty({ example: 1, description: 'Identificador del producto despachado' })
  @Type(() => Number)
  @IsInt({ message: 'El identificador de producto debe ser un entero.' })
  @Min(1)
  idProducto!: number;

  @ApiProperty({ example: 10, description: 'Unidades despachadas' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001, { message: 'La cantidad debe ser mayor a cero.' })
  cantidad!: number;

  /*
   * No existe un campo "precio" a proposito. El precio de venta lo determina el
   * servidor a partir del catalogo. Aceptarlo del cliente permitiria despachar
   * medicamentos a un importe manipulado.
   */
}

export class RegistrarVentaDto {
  @ApiProperty({
    type: [LineaVentaDto],
    description:
      'Productos de la venta. El servidor valida que ninguna cantidad supere el stock ' +
      'disponible; si alguna lo hace, se rechaza la venta completa.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe contener al menos un producto.' })
  @ArrayMaxSize(200, { message: 'Una venta no puede superar 200 lineas de detalle.' })
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas!: LineaVentaDto[];
}

export class ListarVentasDto extends PaginacionDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaDesde debe tener formato AAAA-MM-DD.' })
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaHasta debe tener formato AAAA-MM-DD.' })
  fechaHasta?: string;
}

export class VentaRespuestaDto {
  @ApiProperty() idVentaCab!: number;
  @ApiProperty() fechaRegistro!: Date;
  @ApiProperty({ description: 'Suma de los subtotales del detalle' }) subTotal!: number;
  @ApiProperty({ description: 'Suma de los IGV del detalle' }) igv!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  detalle!: unknown[];
}
