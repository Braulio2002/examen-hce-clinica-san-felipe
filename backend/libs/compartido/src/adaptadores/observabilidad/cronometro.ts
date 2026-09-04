import type { RegistroPuerto } from '../../aplicacion/puertos/registro.puerto';

/**
 * CAPA 3 · ADAPTADORES — Medición de duración de operaciones.
 *
 * La usan los decoradores de repositorio (patrón Decorator) para instrumentar
 * el acceso a datos sin contaminar la implementación real.
 *
 * Depende del puerto de registro y no del Logger de NestJS, de modo que la
 * medición es probable con un doble en memoria.
 */
export async function medirTiempo<T>(
  registro: RegistroPuerto,
  operacion: string,
  ejecutar: () => Promise<T>,
  umbralLentoMs = 500,
): Promise<T> {
  const inicio = process.hrtime.bigint();

  try {
    const resultado = await ejecutar();
    const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;

    if (ms >= umbralLentoMs) {
      registro.advertir(
        `${operacion} completado en ${ms.toFixed(1)} ms (operacion lenta)`,
      );
    } else {
      registro.depurar(`${operacion} completado en ${ms.toFixed(1)} ms`);
    }
    return resultado;
  } catch (error) {
    const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;
    registro.advertir(
      `${operacion} fallo tras ${ms.toFixed(1)} ms: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }
}
