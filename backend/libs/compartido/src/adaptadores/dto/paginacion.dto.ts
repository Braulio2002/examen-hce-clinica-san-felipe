import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { LIMITES_PAGINACION } from '../../aplicacion/modelos/paginacion';

/**
 * CAPA 3 · ADAPTADORES — DTOs de transporte.
 *
 * Aquí sí viven los decoradores de Swagger y class-validator: son detalle del
 * adaptador HTTP, no de la lógica de negocio. La capa de aplicación consume las
 * interfaces planas de `aplicacion/modelos/paginacion.ts`, a las que estos DTOs
 * son asignables estructuralmente.
 *
 * Ésta es la razón práctica de la separación: si mañana la API se expusiera por
 * gRPC en lugar de REST, se reemplazarían estos DTOs y ni el caso de uso ni el
 * dominio cambiarían.
 */
export class PaginacionDto {
  @ApiPropertyOptional({
    description: 'Número de página (base 1)',
    default: LIMITES_PAGINACION.PAGINA_MINIMA,
    minimum: LIMITES_PAGINACION.PAGINA_MINIMA,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero.' })
  @Min(LIMITES_PAGINACION.PAGINA_MINIMA, { message: 'La pagina minima es 1.' })
  pagina: number = LIMITES_PAGINACION.PAGINA_MINIMA;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página',
    default: LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
    minimum: 1,
    maximum: LIMITES_PAGINACION.TAMANO_MAXIMO,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamano de pagina debe ser un numero entero.' })
  @Min(1)
  @Max(LIMITES_PAGINACION.TAMANO_MAXIMO, {
    message: `El tamano maximo de pagina es ${LIMITES_PAGINACION.TAMANO_MAXIMO}.`,
  })
  tamanoPagina: number = LIMITES_PAGINACION.TAMANO_POR_DEFECTO;
}

/** Paginación más un término de búsqueda libre. */
export class PaginacionBusquedaDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Texto a buscar por nombre o número de lote' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  buscar?: string;
}
