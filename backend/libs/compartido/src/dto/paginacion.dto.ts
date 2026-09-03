import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Parametros de paginacion comunes a todos los listados. */
export class PaginacionDto {
  @ApiPropertyOptional({ description: 'Numero de pagina (base 1)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero.' })
  @Min(1, { message: 'La pagina minima es 1.' })
  pagina: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por pagina',
    default: 20,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamano de pagina debe ser un numero entero.' })
  @Min(1)
  @Max(200, { message: 'El tamano maximo de pagina es 200.' })
  tamanoPagina: number = 20;
}

/** Paginacion mas un termino de busqueda libre. */
export class PaginacionBusquedaDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Texto a buscar por nombre o numero de lote' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  buscar?: string;
}

/** Envoltura estandar de todo listado paginado que devuelve la API. */
export interface ResultadoPaginado<T> {
  readonly datos: T[];
  readonly meta: {
    readonly pagina: number;
    readonly tamanoPagina: number;
    readonly totalRegistros: number;
    readonly totalPaginas: number;
  };
}

/** Construye la envoltura a partir de las filas y el total devuelto por SQL Server. */
export function construirPaginado<T>(
  datos: T[],
  totalRegistros: number,
  pagina: number,
  tamanoPagina: number,
): ResultadoPaginado<T> {
  return {
    datos,
    meta: {
      pagina,
      tamanoPagina,
      totalRegistros,
      totalPaginas: tamanoPagina > 0 ? Math.ceil(totalRegistros / tamanoPagina) : 0,
    },
  };
}
