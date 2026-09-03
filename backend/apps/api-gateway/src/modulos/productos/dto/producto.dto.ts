import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginacionBusquedaDto } from '@hce/compartido';

export class CrearProductoDto {
  @ApiProperty({ example: 'Paracetamol 500 mg Tableta', maxLength: 150 })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio.' })
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombreProducto!: string;

  @ApiProperty({ example: 'LT-2026-0001', maxLength: 50 })
  @IsString()
  @IsNotEmpty({ message: 'El numero de lote es obligatorio.' })
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nroLote!: string;

  @ApiProperty({ example: 0.45, description: 'Costo unitario de adquisicion' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'El costo admite hasta 4 decimales.' })
  @Min(0, { message: 'El costo no puede ser negativo.' })
  costo!: number;

  @ApiPropertyOptional({
    example: 0.6075,
    description: 'Si se omite, se calcula automaticamente como Costo * 1.35',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioVenta?: number;
}

export class ActualizarProductoDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacio.' })
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombreProducto?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El numero de lote no puede quedar vacio.' })
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nroLote?: string;

  @ApiPropertyOptional({ example: 0.52 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costo?: number;

  @ApiPropertyOptional({
    example: 0.702,
    description: 'Si se omite y se envia costo, se recalcula como Costo * 1.35',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  precioVenta?: number;
}

export class ListarProductosDto extends PaginacionBusquedaDto {
  @ApiPropertyOptional({
    description: 'Devuelve unicamente productos con existencia disponible',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  soloConStock?: boolean = false;
}

export class ProductoRespuestaDto {
  @ApiProperty({ example: 1 }) idProducto!: number;
  @ApiProperty({ example: 'Paracetamol 500 mg Tableta' }) nombreProducto!: string;
  @ApiProperty({ example: 'LT-2026-0001' }) nroLote!: string;
  @ApiProperty({ example: '2026-09-03T08:46:53.000Z' }) fechaRegistro!: Date;
  @ApiProperty({ example: 0.49 }) costo!: number;
  @ApiProperty({ example: 0.6615 }) precioVenta!: number;
  @ApiProperty({ example: 680, description: 'Stock derivado de la tabla de movimientos' })
  stockActual!: number;
}
