import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
  CodigoError,
  ExcepcionDominio,
} from '../../dominio/excepciones/dominio.excepcion';

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
        trazaDe(excepcion),
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

      // Se tipa como HttpStatus y no como number: comparar un number suelto
      // contra miembros del enum es exactamente lo que detecta la regla
      // no-unsafe-enum-comparison, y esconde errores cuando el enum cambia.
      const status: HttpStatus = excepcion.getStatus();

      return {
        status,
        codigo: this.codigoDesdeStatus(status),
        mensaje: this.mensajePresentable(status, mensaje),
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
    if (excepcion && typeof excepcion === 'object' && 'codigo' in excepcion)
      return excepcion;
    if (excepcion && typeof excepcion === 'object' && 'error' in excepcion) {
      return excepcion.error;
    }
    return excepcion;
  }

  /**
   * Mensaje que se muestra al usuario final.
   *
   * El texto crudo del throttler ("ThrottlerException: Too Many Requests") no le
   * dice nada a quien esta usando la aplicacion; el resto de mensajes ya vienen
   * redactados por el ValidationPipe o por el dominio.
   */
  private mensajePresentable(status: HttpStatus, mensaje: string | string[]): string {
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return 'Ha superado el limite de peticiones permitido. Intente nuevamente en unos segundos.';
    }
    return Array.isArray(mensaje) ? mensaje.join(' | ') : mensaje;
  }

  /**
   * Traduce el status HTTP al codigo estable que consume el cliente.
   *
   * Se expresa como tabla y no como `switch` porque un `switch` sobre un enum
   * con mas de sesenta miembros nunca es exhaustivo, y la regla
   * switch-exhaustiveness-check lo senala con razon: obligaria a enumerar
   * decenas de casos que jamas se producen. La tabla solo declara los que este
   * sistema emite, y el resto cae en el valor por defecto.
   */
  private codigoDesdeStatus(status: HttpStatus): string {
    return CODIGO_POR_STATUS[status] ?? CodigoError.INFRAESTRUCTURA;
  }
}

/**
 * Codigos de dominio que corresponden a cada status HTTP emitido por la API.
 *
 * `LIMITE_PETICIONES` no es un error de dominio ni de infraestructura: es el
 * rate limit actuando. El FrontEnd lo usa para mostrar "espere un momento" en
 * lugar de "error interno".
 */
const CODIGO_POR_STATUS: Readonly<Partial<Record<HttpStatus, string>>> = {
  [HttpStatus.BAD_REQUEST]: CodigoError.VALIDACION,
  [HttpStatus.UNAUTHORIZED]: CodigoError.NO_AUTORIZADO,
  [HttpStatus.FORBIDDEN]: CodigoError.PROHIBIDO,
  [HttpStatus.NOT_FOUND]: CodigoError.NO_ENCONTRADO,
  [HttpStatus.CONFLICT]: CodigoError.CONFLICTO,
  [HttpStatus.UNPROCESSABLE_ENTITY]: CodigoError.STOCK_INSUFICIENTE,
  [HttpStatus.TOO_MANY_REQUESTS]: 'LIMITE_PETICIONES',
};

/**
 * Extrae la traza de una excepcion de tipo desconocido.
 *
 * Un `as Error` haria creer al compilador que siempre hay `stack`, y lo que
 * llega por el filtro puede ser cualquier cosa: una cadena, un objeto plano
 * serializado por el transporte RPC o null.
 */
function trazaDe(excepcion: unknown): string | undefined {
  return excepcion instanceof Error ? excepcion.stack : undefined;
}
