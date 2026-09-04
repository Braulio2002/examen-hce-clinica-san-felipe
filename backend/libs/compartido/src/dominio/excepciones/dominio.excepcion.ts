/**
 * Excepciones de dominio.
 *
 * El dominio no conoce HTTP ni RPC: lanza errores con significado de negocio y
 * un codigo estable. La traduccion a un status HTTP ocurre una sola vez, en el
 * filtro de excepciones del API Gateway. Esa es la razon de que la capa de
 * dominio pueda probarse sin levantar Nest.
 */

export enum CodigoError {
  VALIDACION = 'VALIDACION',
  NO_ENCONTRADO = 'NO_ENCONTRADO',
  CONFLICTO = 'CONFLICTO',
  STOCK_INSUFICIENTE = 'STOCK_INSUFICIENTE',
  NO_AUTORIZADO = 'NO_AUTORIZADO',
  PROHIBIDO = 'PROHIBIDO',
  INFRAESTRUCTURA = 'INFRAESTRUCTURA',
}

export interface ErrorSerializado {
  readonly codigo: CodigoError;
  readonly mensaje: string;
  readonly detalles?: Readonly<Record<string, unknown>>;
}

export class ExcepcionDominio extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly detalles?: Readonly<Record<string, unknown>>,
  ) {
    super(mensaje);
    this.name = new.target.name;
    // captureStackTrace solo existe en V8; el encadenamiento opcional es
    // deliberado aunque las definiciones de Node lo declaren siempre presente.
    (
      Error as { captureStackTrace?: (o: object, c?: unknown) => void }
    ).captureStackTrace?.(this, new.target);
  }

  serializar(): ErrorSerializado {
    return { codigo: this.codigo, mensaje: this.message, detalles: this.detalles };
  }

  /** Reconstruye la excepcion a partir del payload que viaja por el transporte RPC. */
  static desdeSerializado(payload: unknown): ExcepcionDominio | null {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'codigo' in payload &&
      'mensaje' in payload &&
      typeof (payload as ErrorSerializado).mensaje === 'string' &&
      Object.values(CodigoError).includes((payload as ErrorSerializado).codigo)
    ) {
      const p = payload as ErrorSerializado;
      return new ExcepcionDominio(p.codigo, p.mensaje, p.detalles);
    }
    return null;
  }
}

export class ErrorValidacion extends ExcepcionDominio {
  constructor(mensaje: string, detalles?: Record<string, unknown>) {
    super(CodigoError.VALIDACION, mensaje, detalles);
  }
}

export class ErrorNoEncontrado extends ExcepcionDominio {
  constructor(recurso: string, identificador?: string | number) {
    super(
      CodigoError.NO_ENCONTRADO,
      identificador === undefined
        ? `${recurso} no encontrado.`
        : `${recurso} con identificador ${identificador} no encontrado.`,
      identificador === undefined ? undefined : { recurso, identificador },
    );
  }
}

export class ErrorConflicto extends ExcepcionDominio {
  constructor(mensaje: string, detalles?: Record<string, unknown>) {
    super(CodigoError.CONFLICTO, mensaje, detalles);
  }
}

export class ErrorStockInsuficiente extends ExcepcionDominio {
  constructor(mensaje: string, detalles?: Record<string, unknown>) {
    super(CodigoError.STOCK_INSUFICIENTE, mensaje, detalles);
  }
}

export class ErrorNoAutorizado extends ExcepcionDominio {
  constructor(mensaje = 'Credenciales invalidas.') {
    super(CodigoError.NO_AUTORIZADO, mensaje);
  }
}

export class ErrorProhibido extends ExcepcionDominio {
  constructor(mensaje = 'No cuenta con permisos para ejecutar esta operacion.') {
    super(CodigoError.PROHIBIDO, mensaje);
  }
}

export class ErrorInfraestructura extends ExcepcionDominio {
  constructor(mensaje: string, detalles?: Record<string, unknown>) {
    super(CodigoError.INFRAESTRUCTURA, mensaje, detalles);
  }
}
