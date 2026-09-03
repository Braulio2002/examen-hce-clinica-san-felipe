import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { CodigoError, ExcepcionDominio } from '../../dominio/excepciones/dominio.excepcion';

/** Cuerpo de error uniforme que devuelve la API a cualquier cliente. */
export interface RespuestaError {
  readonly exito: false;
  readonly codigo: string;
  readonly mensaje: string;
  readonly detalles?: unknown;
  readonly ruta: string;
  readonly marcaTiempo: string;
}

/** Traduccion de codigo de dominio a status HTTP. Unico lugar donde ocurre. */
const MAPA_HTTP: Readonly<Record<CodigoError, HttpStatus>> = {
  [CodigoError.VALIDACION]: HttpStatus.BAD_REQUEST,
  [CodigoError.NO_ENCONTRADO]: HttpStatus.NOT_FOUND,
  [CodigoError.CONFLICTO]: HttpStatus.CONFLICT,
  [CodigoError.STOCK_INSUFICIENTE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [CodigoError.NO_AUTORIZADO]: HttpStatus.UNAUTHORIZED,
  [CodigoError.PROHIBIDO]: HttpStatus.FORBIDDEN,
  [CodigoError.INFRAESTRUCTURA]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Filtro global del API Gateway.
 *
 * Nunca expone el stack ni el mensaje crudo del motor de base de datos al
 * cliente: los errores de infraestructura se registran completos en el servidor
 * y se devuelven genericos. Es un requisito de seguridad, no de estilo.
 */
@Catch()
export class ExcepcionHttpFiltro implements ExceptionFilter {
  private readonly logger = new Logger(ExcepcionHttpFiltro.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();
    const peticion = contexto.getRequest<Request>();

    const { status, codigo, mensaje, detalles } = this.resolver(excepcion);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${peticion.method} ${peticion.url} -> ${status} ${mensaje}`,
        (excepcion as Error)?.stack,
      );
    } else {
      this.logger.warn(`${peticion.method} ${peticion.url} -> ${status} ${mensaje}`);
    }

    const cuerpo: RespuestaError = {
      exito: false,
      codigo,
      mensaje,
      detalles,
      ruta: peticion.url,
      marcaTiempo: new Date().toISOString(),
    };

    respuesta.status(status).json(cuerpo);
  }

  private resolver(excepcion: unknown): {
    status: HttpStatus;
    codigo: string;
    mensaje: string;
    detalles?: unknown;
  } {
    // 1. Error de dominio propagado desde un microservicio o generado local.
    const dominio =
      excepcion instanceof ExcepcionDominio
        ? excepcion
        : ExcepcionDominio.desdeSerializado(this.extraerPayload(excepcion));

    if (dominio) {
      return {
        status: MAPA_HTTP[dominio.codigo],
        codigo: dominio.codigo,
        mensaje:
          dominio.codigo === CodigoError.INFRAESTRUCTURA
            ? 'Ocurrio un error interno. El equipo tecnico ha sido notificado.'
            : dominio.message,
        detalles: dominio.detalles,
      };
    }

    // 2. Excepcion HTTP de Nest (validaciones del ValidationPipe, guards, etc).
    if (excepcion instanceof HttpException) {
      const respuesta = excepcion.getResponse();
      const mensaje =
        typeof respuesta === 'string'
          ? respuesta
          : ((respuesta as { message?: string | string[] }).message ?? excepcion.message);

      const status = excepcion.getStatus();

      return {
        status,
        codigo: this.codigoDesdeStatus(status),
        // El mensaje crudo del throttler ("ThrottlerException: Too Many
        // Requests") no le dice nada al usuario final.
        mensaje:
          status === HttpStatus.TOO_MANY_REQUESTS
            ? 'Ha superado el limite de peticiones permitido. Intente nuevamente en unos segundos.'
            : Array.isArray(mensaje)
              ? mensaje.join(' | ')
              : mensaje,
        detalles: Array.isArray(mensaje) ? { errores: mensaje } : undefined,
      };
    }

    // 3. Cualquier otra cosa: se registra completa, se responde generica.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      codigo: CodigoError.INFRAESTRUCTURA,
      mensaje: 'Ocurrio un error interno. El equipo tecnico ha sido notificado.',
    };
  }

  /** Los errores RPC llegan como el objeto plano que serializo el microservicio. */
  private extraerPayload(excepcion: unknown): unknown {
    if (excepcion && typeof excepcion === 'object' && 'codigo' in excepcion) return excepcion;
    if (excepcion && typeof excepcion === 'object' && 'error' in excepcion) {
      return (excepcion as { error: unknown }).error;
    }
    return excepcion;
  }

  private codigoDesdeStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return CodigoError.VALIDACION;
      case HttpStatus.UNAUTHORIZED:
        return CodigoError.NO_AUTORIZADO;
      case HttpStatus.FORBIDDEN:
        return CodigoError.PROHIBIDO;
      case HttpStatus.NOT_FOUND:
        return CodigoError.NO_ENCONTRADO;
      case HttpStatus.CONFLICT:
        return CodigoError.CONFLICTO;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return CodigoError.STOCK_INSUFICIENTE;
      case HttpStatus.TOO_MANY_REQUESTS:
        // No es un error de dominio ni de infraestructura: es el rate limit
        // actuando. El FrontEnd lo usa para mostrar "espere un momento" en
        // lugar de "error interno".
        return 'LIMITE_PETICIONES';
      default:
        return CodigoError.INFRAESTRUCTURA;
    }
  }
}
