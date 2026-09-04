import { type NextRequest, NextResponse } from 'next/server';

/**
 * Guardia de rutas de la shell.
 *
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
 * antes de la reescritura hacia la otra zona. Asi la proteccion de rutas queda
 * centralizada en la shell.
 */
const NOMBRE_COOKIE = process.env.JWT_COOKIE ?? 'hce_access_token';

const RUTAS_PUBLICAS = ['/login'];

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

  return NextResponse.next();
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
