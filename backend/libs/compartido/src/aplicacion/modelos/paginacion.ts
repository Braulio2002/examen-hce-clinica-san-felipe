/**
 * CAPA 2 · APLICACION — Modelos que cruzan la frontera del caso de uso.
 *
 * En Clean Architecture, lo que atraviesa una frontera son estructuras de datos
 * simples, no entidades ni objetos del framework. Estos tipos son justamente
 * eso: interfaces planas, sin decoradores, sin dependencias.
 *
 * La versión con decoradores de Swagger y class-validator vive en la capa de
 * adaptadores (`adaptadores/dto/paginacion.dto.ts`). La separación no es
 * ceremonia: permite que la capa de aplicación se compile y se pruebe sin
 * NestJS instalado.
 */

/** Petición de un listado paginado. */
export interface ConsultaPaginada {
  readonly pagina: number;
  readonly tamanoPagina: number;
}

/** Petición de un listado paginado con búsqueda por texto libre. */
export interface ConsultaPaginadaConBusqueda extends ConsultaPaginada {
  readonly buscar?: string;
}

/** Metadatos de paginación devueltos junto con los datos. */
export interface MetaPaginacion {
  readonly pagina: number;
  readonly tamanoPagina: number;
  readonly totalRegistros: number;
  readonly totalPaginas: number;
}

/** Envoltura estándar de todo listado paginado del sistema. */
export interface ResultadoPaginado<T> {
  readonly datos: T[];
  readonly meta: MetaPaginacion;
}

/**
 * Construye la envoltura a partir de las filas y el total.
 *
 * Es una función pura sin dependencias: pertenece a la capa de aplicación
 * porque expresa una regla de presentación de resultados compartida por todos
 * los casos de uso de listado.
 */
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

/** Límites de paginación aplicados de forma uniforme en todos los listados. */
export const LIMITES_PAGINACION = {
  PAGINA_MINIMA: 1,
  TAMANO_POR_DEFECTO: 20,
  TAMANO_MAXIMO: 200,
} as const;

/**
 * Normaliza una consulta paginada aplicando los límites.
 * Evita que un cliente pida cien mil registros de una vez y sature la base.
 */
export function normalizarPaginacion(
  consulta: Partial<ConsultaPaginada>,
): ConsultaPaginada {
  const pagina = Math.max(
    LIMITES_PAGINACION.PAGINA_MINIMA,
    Math.trunc(consulta.pagina ?? 1) || 1,
  );

  const solicitado = Math.trunc(
    consulta.tamanoPagina ?? LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
  );

  /*
   * La comprobacion de NaN va primero, y no es defensiva de mas.
   *
   * `Math.trunc(NaN)` es NaN, y `NaN < 1` es false. Sin esta guarda el valor se
   * colaba hasta `Math.min(NaN, 200)`, que tambien es NaN, y salia de aqui como
   * tamano de pagina. Aguas abajo eso llega al procedimiento como
   * `FETCH NEXT NaN ROWS`.
   *
   * El DTO del Gateway ya rechaza un valor no numerico, pero esta funcion es
   * compartida y la usa tambien codigo interno: no puede apoyarse en que alguien
   * haya validado antes. Lo destapo una prueba, no produccion.
   */
  const tamanoPagina =
    !Number.isFinite(solicitado) || solicitado < 1
      ? LIMITES_PAGINACION.TAMANO_POR_DEFECTO
      : Math.min(solicitado, LIMITES_PAGINACION.TAMANO_MAXIMO);

  return { pagina, tamanoPagina };
}
