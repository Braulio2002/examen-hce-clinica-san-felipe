import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import {
  correlacionDesdePayload,
  ejecutarConCorrelacion,
  nuevaCorrelacion,
} from './contexto-correlacion';

/**
 * CAPA 3 · ADAPTADORES — Activa el identificador de correlación de la petición.
 *
 * Sirve a los dos extremos, porque el mecanismo es el mismo y el origen del
 * identificador es lo único que cambia:
 *
 *   - En el API Gateway la petición llega por HTTP. Se toma la cabecera
 *     `X-Request-Id` si el cliente la envía —lo que permite enlazar la traza con
 *     un balanceador o una pasarela externa— y si no, se genera una. Se devuelve
 *     en la respuesta para que quien reporte un fallo pueda citarla.
 *
 *   - En los microservicios la petición llega por RPC, y el identificador viene
 *     dentro del payload porque el transporte TCP no ofrece otro canal.
 *
 * A partir de ahí todo el trabajo de la petición ocurre dentro del contexto, de
 * modo que cualquier línea de registro lo lleva sin que nadie lo transporte.
 *
 * Se declara global en cada `main.ts`. Ser un interceptor y no un middleware es
 * deliberado: el middleware de Express no cubre el transporte RPC, y hacían
 * falta las dos rutas.
 */
@Injectable()
export class CorrelacionInterceptor implements NestInterceptor {
  private readonly registro = new Logger('Peticion');

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const identificador = this.resolver(contexto);

    return ejecutarConCorrelacion(identificador, () => {
      // Solo se registra el tramo HTTP. En RPC lo hacen ya los decoradores de
      // las pasarelas, y anadir otra linea por mensaje duplicaria la traza.
      if (contexto.getType() !== 'http') return siguiente.handle();

      const peticion = contexto
        .switchToHttp()
        .getRequest<{ method?: string; originalUrl?: string; url?: string }>();
      const descripcion = `${peticion.method ?? '?'} ${peticion.originalUrl ?? peticion.url ?? '?'}`;
      const inicio = Date.now();

      // El registro va en el borde y con la duracion: es lo que convierte la
      // traza en algo accionable. Sin el, la cadena empezaba en el microservicio
      // y no se veia cuanto tardo la peticion completa ni por donde entro.
      return siguiente.handle().pipe(
        tap({
          next: () => {
            const ms = Date.now() - inicio;
            this.registro.log(`[${identificador}] ${descripcion} — ${ms} ms`);
          },
          error: (fallo: unknown) => {
            const ms = Date.now() - inicio;
            const motivo = fallo instanceof Error ? fallo.message : 'error';
            this.registro.warn(
              `[${identificador}] ${descripcion} — ${ms} ms — ${motivo}`,
            );
          },
        }),
      );
    });
  }

  private resolver(contexto: ExecutionContext): string {
    if (contexto.getType() === 'rpc') {
      return correlacionDesdePayload(contexto.switchToRpc().getData());
    }

    const http = contexto.switchToHttp();
    const peticion = http.getRequest<{ headers?: Record<string, unknown> }>();
    const cabecera = peticion.headers?.['x-request-id'];
    const identificador =
      typeof cabecera === 'string' && cabecera !== '' ? cabecera : nuevaCorrelacion();

    // Se devuelve al cliente: quien reporta un fallo puede citar el
    // identificador, y con eso se recupera la operacion completa en los
    // registros de los cuatro servicios.
    const respuesta = http.getResponse<{ setHeader?: (n: string, v: string) => void }>();
    respuesta.setHeader?.('X-Request-Id', identificador);

    return identificador;
  }
}
