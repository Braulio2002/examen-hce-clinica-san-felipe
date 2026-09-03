import { RequestTimeoutException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError, timeout, TimeoutError } from 'rxjs';

import { ErrorInfraestructura, ExcepcionDominio } from '../../dominio/excepciones/dominio.excepcion';

/** Tiempo maximo que el Gateway espera la respuesta de un microservicio. */
export const TIMEOUT_RPC_MS = 10_000;

/**
 * Envia un mensaje a un microservicio y devuelve su respuesta.
 *
 * Aporta tres cosas que el `client.send()` desnudo no da:
 *   1. Un timeout explicito, para que un microservicio caido no deje colgada la
 *      peticion HTTP del usuario hasta que expire el socket.
 *   2. La reconstruccion de la excepcion de dominio serializada, de modo que el
 *      filtro HTTP pueda devolver el status correcto en lugar de un 500 opaco.
 *   3. Un punto unico donde instrumentar trazabilidad entre servicios.
 */
export async function enviarMensaje<TRespuesta, TPayload = unknown>(
  cliente: ClientProxy,
  patron: string,
  payload: TPayload,
  timeoutMs: number = TIMEOUT_RPC_MS,
): Promise<TRespuesta> {
  return firstValueFrom(
    cliente.send<TRespuesta, TPayload>(patron, payload).pipe(
      timeout(timeoutMs),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `El servicio no respondio dentro de ${timeoutMs} ms (${patron}).`,
              ),
          );
        }

        const dominio = ExcepcionDominio.desdeSerializado(desenvolver(error));
        if (dominio) return throwError(() => dominio);

        return throwError(
          () =>
            new ErrorInfraestructura(
              `Fallo la comunicacion con el microservicio en el patron ${patron}.`,
            ),
        );
      }),
    ),
  );
}

/** El transporte puede envolver el payload de error en distintas formas. */
function desenvolver(error: unknown): unknown {
  if (error && typeof error === 'object') {
    if ('codigo' in error) return error;
    if ('error' in error) return (error as { error: unknown }).error;
    if ('message' in error && typeof (error as { message: unknown }).message === 'object') {
      return (error as { message: unknown }).message;
    }
  }
  return error;
}
