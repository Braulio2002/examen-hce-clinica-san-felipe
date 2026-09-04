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

export class LineaCompraDto {
  @ApiProperty({ example: 1, description: 'Identificador del producto comprado' })
  @Type(() => Number)
  @IsInt({ message: 'El identificador de producto debe ser un entero.' })
  @Min(1)
  idProducto!: number;

  @ApiProperty({ example: 100, description: 'Unidades adquiridas' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001, { message: 'La cantidad debe ser mayor a cero.' })
  cantidad!: number;

  @ApiProperty({ example: 0.45, description: 'Costo unitario de adquisicion' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'El costo unitario no puede ser negativo.' })
  precio!: number;
}

export class RegistrarCompraDto {
  @ApiProperty({
    type: [LineaCompraDto],
    description: 'Productos incluidos en la compra. Debe contener al menos una linea.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'La compra debe contener al menos un producto.' })
  @ArrayMaxSize(200, { message: 'Una compra no puede superar 200 lineas de detalle.' })
  @ValidateNested({ each: true })
  @Type(() => LineaCompraDto)
  lineas!: LineaCompraDto[];
}

export class ListarComprasDto extends PaginacionDto {
  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Fecha inicial (inclusive)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'fechaDesde debe tener formato AAAA-MM-DD.' })
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Fecha final (inclusive)' })
  @IsOptional()
  @IsDateString({}, { message: 'fechaHasta debe tener formato AAAA-MM-DD.' })
  fechaHasta?: string;
}

export class LineaDocumentoRespuestaDto {
  @ApiProperty() idDetalle!: number;
  @ApiProperty() idProducto!: number;
  @ApiProperty() nombreProducto!: string;
  @ApiProperty() nroLote!: string;
  @ApiProperty() cantidad!: number;
  @ApiProperty() precio!: number;
  @ApiProperty() subTotal!: number;
  @ApiProperty() igv!: number;
  @ApiProperty() total!: number;
}

export class CompraRespuestaDto {
  @ApiProperty() idCompraCab!: number;
  @ApiProperty() fechaRegistro!: Date;
  @ApiProperty() subTotal!: number;
  @ApiProperty() igv!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [LineaDocumentoRespuestaDto] })
  detalle!: LineaDocumentoRespuestaDto[];
}
