/**
 * Configuracion y validacion de variables de entorno del API Gateway.
 *
 * La validacion ocurre en el arranque, no en el primer uso: es preferible que
 * el contenedor no levante a que lo haga con un JWT_SECRET vacio y acepte
 * tokens firmados con una cadena por defecto.
 */

export interface ConfiguracionGateway {
  readonly puerto: number;
  readonly prefijoApi: string;
  readonly entorno: string;
  readonly origenesPermitidos: string[];
  readonly cookieSegura: boolean;
  readonly jwt: {
    readonly secreto: string;
    readonly expiracionSegundos: number;
    readonly emisor: string;
    readonly audiencia: string;
    readonly nombreCookie: string;
  };
  readonly rateLimit: {
    readonly ventanaSegundos: number;
    readonly limiteGeneral: number;
    readonly limiteLogin: number;
  };
  readonly microservicios: {
    readonly auth: { host: string; puerto: number };
    readonly catalogo: { host: string; puerto: number };
    readonly inventario: { host: string; puerto: number };
  };
}

/** Longitud minima aceptable para el secreto de firma HS256. */
const LONGITUD_MINIMA_SECRETO = 32;

export function cargarConfiguracion(): ConfiguracionGateway {
  const entorno = process.env.NODE_ENV ?? 'development';
  const secreto = process.env.JWT_SECRET ?? '';

  if (secreto.length < LONGITUD_MINIMA_SECRETO) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${LONGITUD_MINIMA_SECRETO} caracteres. ` +
        'Genere uno con: openssl rand -base64 48',
    );
  }

  /*
   * CORS restringido a los origenes declarados. Nunca se usa "*": el enunciado
   * pide explicitamente que la API solo pueda ser consumida por el FrontEnd, y
   * un comodin ademas impide enviar cookies con credenciales.
   */
  const origenesPermitidos = (process.env.CORS_ORIGENES ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origenesPermitidos.includes('*')) {
    throw new Error('CORS_ORIGENES no admite el comodin "*". Declare los origenes explicitamente.');
  }

  return {
    puerto: numero(process.env.GATEWAY_PORT, 4000),
    prefijoApi: process.env.API_PREFIJO ?? 'api',
    entorno,
    origenesPermitidos,
    // En produccion la cookie viaja solo por HTTPS.
    cookieSegura: (process.env.COOKIE_SEGURA ?? String(entorno === 'production')) === 'true',
    jwt: {
      secreto,
      // El enunciado exige una duracion estricta de 30 minutos = 1800 segundos.
      expiracionSegundos: numero(process.env.JWT_EXPIRACION_SEGUNDOS, 1800),
      emisor: process.env.JWT_ISSUER ?? 'hce-clinica-san-felipe',
      audiencia: process.env.JWT_AUDIENCE ?? 'hce-frontend',
      nombreCookie: process.env.JWT_COOKIE ?? 'hce_access_token',
    },
    rateLimit: {
      ventanaSegundos: numero(process.env.RATE_LIMIT_VENTANA_SEGUNDOS, 60),
      limiteGeneral: numero(process.env.RATE_LIMIT_GENERAL, 100),
      // El login es mas restrictivo: es la superficie de fuerza bruta.
      limiteLogin: numero(process.env.RATE_LIMIT_LOGIN, 5),
    },
    microservicios: {
      auth: {
        host: process.env.MS_AUTH_HOST ?? 'localhost',
        puerto: numero(process.env.MS_AUTH_PORT, 4001),
      },
      catalogo: {
        host: process.env.MS_CATALOGO_HOST ?? 'localhost',
        puerto: numero(process.env.MS_CATALOGO_PORT, 4002),
      },
      inventario: {
        host: process.env.MS_INVENTARIO_HOST ?? 'localhost',
        puerto: numero(process.env.MS_INVENTARIO_PORT, 4003),
      },
    },
  };
}

function numero(valor: string | undefined, porDefecto: number): number {
  const parseado = Number(valor);
  return Number.isFinite(parseado) && parseado > 0 ? parseado : porDefecto;
}
