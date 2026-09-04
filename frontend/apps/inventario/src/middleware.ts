import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware de la zona de inventario: cabecera CSP y guardia de sesion.
 *
 * POR QUE LA ZONA TIENE SU PROPIA GUARDIA
 * ---------------------------------------
 * El middleware de la shell ya cubre /inventario/*, porque en Multi-Zones se
 * ejecuta antes de la reescritura. Mientras se entre por la shell, esta guardia
 * no llega a actuar nunca.
 *
 * Existe para el caso en que no se entre por ahi. La zona es una aplicacion
 * independiente con su propio contenedor: hoy no publica puerto al exterior,
 * pero eso es una propiedad del despliegue, no del codigo. Si una regla de red
 * o un proxy mal configurado la dejara accesible, sus pantallas se renderizaban
 * sin comprobar nada.
 *
 * Depender de que la shell sea el unico camino es depender de la topologia. Que
 * cada zona compruebe lo suyo es lo que las hace desplegables por separado de
 * verdad.
 *
 * Como en la shell, esto NO es el control de seguridad: solo mira que la cookie
 * exista. La autoridad sigue siendo el API Gateway.
 *
 * CONTENT SECURITY POLICY
 * -----------------------
 * Se emite aqui y no en next.config.ts porque el nonce cambia en cada peticion
 * y next.config.ts solo produce cabeceras estaticas. El nonce viaja tambien en
 * las cabeceras de la peticion: es como Next lo lee y lo aplica a sus scripts
 * de hidratacion, evitando tener que abrir `script-src` a 'unsafe-inline'.
 */
const NOMBRE_COOKIE = process.env.JWT_COOKIE ?? 'hce_access_token';

/** Origen del API Gateway, al que el navegador si debe poder conectarse. */
const ORIGEN_API = new URL(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
).origin;

function construirCsp(nonce: string): string {
  const enDesarrollo = process.env.NODE_ENV !== 'production';

  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${enDesarrollo ? " 'unsafe-eval'" : ''}`,
    // Next y Tailwind inyectan estilos en linea sin nonce. Es el compromiso
    // habitual: el riesgo en `style-src` es mucho menor que en `script-src`.
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

  if (!peticion.cookies.get(NOMBRE_COOKIE)?.value) {
    // El login vive en la shell, fuera del basePath de esta zona. Se construye
    // la URL desde el origen para que `basePath: '/inventario'` no se anteponga.
    const url = new URL('/login', peticion.url);
    url.searchParams.set('destino', `/inventario${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const nonce = crypto.randomUUID();
  const csp = construirCsp(nonce);

  const cabecerasPeticion = new Headers(peticion.headers);
  cabecerasPeticion.set('x-nonce', nonce);
  cabecerasPeticion.set('Content-Security-Policy', csp);

  const respuesta = NextResponse.next({ request: { headers: cabecerasPeticion } });
  respuesta.headers.set('Content-Security-Policy', csp);

  return respuesta;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
