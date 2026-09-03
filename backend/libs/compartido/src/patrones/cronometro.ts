import { Logger } from '@nestjs/common';

/**
 * Utilidad usada por los decoradores de repositorio (patron Decorator).
 *
 * Mide la duracion de una operacion asincrona y la registra. Se extrae aqui
 * para que cada decorador concreto aporte solo su intencion (trazar, cachear,
 * reintentar) y no repita la mecanica de medicion. Es el principio DRY aplicado
 * a los envoltorios.
 */
export async function medirTiempo<T>(
  logger: Logger,
  operacion: string,
  ejecutar: () => Promise<T>,
  umbralLentoMs = 500,
): Promise<T> {
  const inicio = process.hrtime.bigint();

  try {
    const resultado = await ejecutar();
    const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;

    if (ms >= umbralLentoMs) {
      logger.warn(`${operacion} completado en ${ms.toFixed(1)} ms (operacion lenta)`);
    } else {
      logger.debug(`${operacion} completado en ${ms.toFixed(1)} ms`);
    }
    return resultado;
  } catch (error) {
    const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;
    logger.warn(
      `${operacion} fallo tras ${ms.toFixed(1)} ms: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}
