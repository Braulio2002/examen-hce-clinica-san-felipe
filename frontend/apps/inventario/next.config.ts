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
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  transpilePackages: ['@hce/ui', '@hce/api-cliente'],
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
