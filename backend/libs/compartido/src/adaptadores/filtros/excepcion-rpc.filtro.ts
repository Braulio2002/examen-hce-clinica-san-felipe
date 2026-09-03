import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

import {
  CodigoError,
  ErrorSerializado,
  ExcepcionDominio,
} from '../../dominio/excepciones/dominio.excepcion';

/**
 * Filtro global de los microservicios.
 *
 * Convierte cualquier excepcion en un payload serializado con codigo de dominio
 * estable, para que viaje intacto por el transporte TCP y el API Gateway pueda
 * traducirlo a un status HTTP.
 *
 * Sin esto, un error lanzado dentro de un microservicio llega al Gateway como
 * un objeto vacio y el cliente recibe siempre un 500 sin informacion util, que
 * es el problema clasico de depuracion en arquitecturas distribuidas.
 */
@Catch()
export class ExcepcionRpcFiltro implements ExceptionFilter {
  private readonly logger = new Logger(ExcepcionRpcFiltro.name);

  catch(excepcion: unknown, _host: ArgumentsHost): Observable<never> {
    const payload = this.serializar(excepcion);

    if (payload.codigo === CodigoError.INFRAESTRUCTURA) {
      this.logger.error(payload.mensaje, (excepcion as Error)?.stack);
    } else {
      this.logger.warn(`${payload.codigo}: ${payload.mensaje}`);
    }

    return throwError(() => new RpcException(payload as unknown as Record<string, unknown>));
  }

  private serializar(excepcion: unknown): ErrorSerializado {
    if (excepcion instanceof ExcepcionDominio) {
      return excepcion.serializar();
    }

    if (excepcion instanceof RpcException) {
      const error = excepcion.getError();
      const reconstruida = ExcepcionDominio.desdeSerializado(error);
      if (reconstruida) return reconstruida.serializar();
      return {
        codigo: CodigoError.INFRAESTRUCTURA,
        mensaje: typeof error === 'string' ? error : 'Error en el microservicio.',
      };
    }

    if (excepcion instanceof RangeError || excepcion instanceof TypeError) {
      return { codigo: CodigoError.VALIDACION, mensaje: excepcion.message };
    }

    return {
      codigo: CodigoError.INFRAESTRUCTURA,
      mensaje: 'Error interno del microservicio.',
    };
  }
}
