import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware de la shell: cabecera CSP y guardia de rutas.
 *
 * GUARDIA DE RUTAS
 * ----------------
 * Comprueba unicamente la PRESENCIA de la cookie de sesion y redirige al login
 * cuando falta. Deliberadamente NO verifica la firma del token: hacerlo
 * obligaria a distribuir JWT_SECRET al contenedor del FrontEnd, ampliando la
 * superficie de exposicion del secreto a cambio de nada, porque la autoridad
 * real es el API Gateway y este rechaza cualquier token invalido o vencido.
 *
 * En otras palabras: esto es una mejora de experiencia de usuario (evita
 * pantallas que fallarian igual), no un control de seguridad. El control de
 * seguridad vive en el BackEnd.
 *
 * El middleware tambien cubre /inventario/*, porque en Multi-Zones se ejecuta
 * antes de la reescritura hacia la otra zona.
 *
 * CONTENT SECURITY POLICY
 * -----------------------
 * La CSP se emite aqui y no en next.config.ts porque necesita un nonce distinto
 * en cada peticion, y next.config.ts solo produce cabeceras estaticas.
 *
 * El nonce viaja en las cabeceras de la peticion ademas de en la respuesta: es
 * el mecanismo por el que Next lo lee y lo aplica a sus propios scripts de
 * hidratacion. Sin el habria que abrir `script-src` a 'unsafe-inline', que es
 * precisamente lo que una CSP debe impedir.
 *
 * Cada zona emite la suya. No se comparte en un paquete a proposito: son
 * aplicaciones que se despliegan por separado, y una politica de seguridad
 * propia es parte de lo que las hace independientes -igual que cada
 * microservicio del BackEnd configura su propio Helmet-.
 */
const NOMBRE_COOKIE = process.env.JWT_COOKIE ?? 'hce_access_token';

const RUTAS_PUBLICAS = ['/login'];

/** Origen del API Gateway, al que el navegador si debe poder conectarse. */
const ORIGEN_API = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
).origin;

function construirCsp(nonce: string): string {
  const enDesarrollo = process.env.NODE_ENV !== 'production';

  const directivas = [
    "default-src 'self'",
    // 'strict-dynamic' permite que los scripts firmados con el nonce carguen a
    // su vez los fragmentos que Next divide, sin listar cada archivo.
    // 'unsafe-eval' solo en desarrollo: React Refresh lo necesita.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${enDesarrollo ? " 'unsafe-eval'" : ''}`,
    // Los estilos si admiten 'unsafe-inline': Next y Tailwind inyectan estilos
    // en linea sin nonce, y no hay forma de evitarlo sin romper el renderizado.
    // Es el compromiso habitual y el riesgo es mucho menor que en scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${ORIGEN_API}${enDesarrollo ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!enDesarrollo) directivas.push('upgrade-insecure-requests');

  return directivas.join('; ');
}

export function middleware(peticion: NextRequest): NextResponse {
  const { pathname, search } = peticion.nextUrl;

  const esPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta));
  const tieneSesion = Boolean(peticion.cookies.get(NOMBRE_COOKIE)?.value);

  if (!esPublica && !tieneSesion) {
    const url = peticion.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    // Se conserva el destino para volver alli despues de autenticarse.
    url.searchParams.set('destino', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (esPublica && tieneSesion) {
    const url = peticion.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const nonce = crypto.randomUUID();
  const csp = construirCsp(nonce);

  // Next lee el nonce de la cabecera de PETICION para aplicarlo a sus scripts.
  const cabecerasPeticion = new Headers(peticion.headers);
  cabecerasPeticion.set('x-nonce', nonce);
  cabecerasPeticion.set('Content-Security-Policy', csp);

  const respuesta = NextResponse.next({ request: { headers: cabecerasPeticion } });
  respuesta.headers.set('Content-Security-Policy', csp);

  return respuesta;
}

export const config = {
  matcher: [
    /*
     * Se excluyen los recursos internos de Next, los archivos estaticos y el
     * favicon: aplicar el middleware a cada asset multiplica la latencia sin
     * aportar proteccion.
     */
    '/((?!_next/static|_next/image|inventario/_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
