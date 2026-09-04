import { join } from 'node:path';

import type { NextConfig } from 'next';

/**
 * ZONA DE INVENTARIO (microfront independiente)
 * =============================================
 * Aplicacion Next autonoma que resuelve las tres pantallas transaccionales del
 * enunciado: registro de compras, registro de ventas y visualizacion del
 * Kardex.
 *
 * basePath: '/inventario' hace que todas sus rutas y sus assets se sirvan bajo
 * ese prefijo. Eso es lo que permite que la shell la incruste por reescritura
 * sin colisiones de rutas ni de archivos estaticos.
 *
 * Se despliega en su propio contenedor y puede actualizarse sin reconstruir la
 * shell: ese es el beneficio concreto del enfoque de microfront frente a una
 * aplicacion monolitica.
 */
const nextConfig: NextConfig = {
  basePath: '/inventario',
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../../'),
  transpilePackages: ['@hce/ui', '@hce/api-cliente'],
  poweredByHeader: false,

  /**
   * Cabeceras estaticas de la zona.
   *
   * Son las mismas que emite la shell, y eso es deliberado. Antes esta zona
   * declaraba solo dos: al ser una aplicacion con su propio contenedor, si
   * llegara a ser alcanzable de forma directa sus pantallas de compras, ventas
   * y kardex quedaban sin proteccion frente a clickjacking. Una unidad
   * desplegable por separado no puede apoyarse en las cabeceras de otra.
   *
   * La Content-Security-Policy no esta aqui: necesita un nonce por peticion y
   * se emite desde `src/middleware.ts`.
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
