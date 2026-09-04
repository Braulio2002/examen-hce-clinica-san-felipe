import { join } from 'node:path';

import type { NextConfig } from 'next';

/**
 * SHELL DEL MICROFRONT (zona anfitriona)
 * ======================================
 * Implementa el patron Multi-Zones de Next.js, que es el mecanismo de
 * microfrontend soportado oficialmente por el framework.
 *
 * Cada zona es una aplicacion Next independiente: se compila, se prueba y se
 * despliega por su cuenta, con su propio contenedor. La shell las compone en
 * una sola URL mediante reescrituras, de modo que el usuario navega por
 * http://localhost:3000 sin percibir que hay dos aplicaciones detras.
 *
 * Reparto de responsabilidades:
 *   - shell       -> autenticacion, navegacion, catalogo de productos.
 *   - inventario  -> compras, ventas y Kardex (el nucleo transaccional).
 *
 * La reescritura de /inventario/:path* cubre tambien /inventario/_next/*,
 * porque la zona declara basePath: '/inventario' y por tanto sirve sus propios
 * assets bajo ese prefijo. Sin eso la zona cargaria sin estilos ni JavaScript.
 *
 * IMPORTANTE: Next evalua rewrites() durante `next build` y congela el
 * resultado en el manifiesto de rutas. ZONA_INVENTARIO_URL debe estar definida
 * en tiempo de CONSTRUCCION (build arg del Dockerfile); definirla solo al
 * arrancar el contenedor no tiene efecto. El valor por defecto sirve para el
 * desarrollo local, donde la zona corre en el puerto 3001 del propio equipo.
 */
const URL_ZONA_INVENTARIO = process.env.ZONA_INVENTARIO_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Salida autonoma: la imagen de produccion no necesita node_modules completos.
  output: 'standalone',
  // El monorepo con workspaces vive un nivel arriba; Next necesita saberlo para
  // trazar correctamente los archivos de la salida standalone.
  outputFileTracingRoot: join(__dirname, '../../'),
  transpilePackages: ['@hce/ui', '@hce/api-cliente'],
  poweredByHeader: false,

  async rewrites() {
    return [
      {
        source: '/inventario',
        destination: `${URL_ZONA_INVENTARIO}/inventario`,
      },
      {
        source: '/inventario/:path*',
        destination: `${URL_ZONA_INVENTARIO}/inventario/:path*`,
      },
    ];
  },

  /**
   * Cabeceras estaticas.
   *
   * La Content-Security-Policy no esta aqui: necesita un nonce distinto en cada
   * peticion y se emite desde `src/middleware.ts`.
   *
   * HSTS se anuncia aunque el despliegue local sea HTTP. El navegador ignora la
   * cabecera si la conexion no es segura, de modo que no estorba en desarrollo
   * y queda lista para el dia que haya TLS delante. Sin `preload`: pedir la
   * inclusion en la lista de los navegadores es una decision con marcha atras
   * lenta, y no corresponde tomarla desde un archivo de configuracion.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
