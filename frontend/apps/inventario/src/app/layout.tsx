import type { Metadata, Viewport } from 'next';
import type React from 'react';

import { ProveedorSesion } from '@hce/ui';

import '@/compartido/api';

import './globals.css';

/**
 * Renderizado por peticion, no prerenderizado.
 *
 * Es lo que permite que la Content-Security-Policy use un nonce. Next aplica el
 * nonce a sus scripts leyendolo de la cabecera CSP de la peticion, y una pagina
 * prerenderizada no tiene peticion: su HTML -y sus etiquetas <script>- se
 * generan una sola vez al compilar. Con `strict-dynamic`, un script sin nonce
 * queda bloqueado, y la pantalla sale en blanco.
 *
 * Comprobado: con las rutas estaticas el navegador no ejecutaba ni un script.
 *
 * El coste es menor de lo que parece. Estas paginas viven tras autenticacion y
 * piden sus datos desde el cliente, asi que lo que se prerenderizaba era una
 * cascara vacia que no se puede cachear en ningun CDN. Se cambia esa cascara
 * por una CSP que si protege.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Inventario | HCE Insumos', template: '%s | HCE Insumos' },
  description: 'Registro de compras, ventas y consulta del Kardex de insumos medicos.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c9457',
};

/**
 * Layout raiz de la zona de inventario.
 *
 * Repite la estructura html/body porque es una aplicacion Next completa e
 * independiente: puede ejecutarse y probarse sola en http://localhost:3001,
 * sin la shell. Esa autonomia es justamente lo que define a un microfront.
 */
export default function LayoutInventario({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="es-PE">
      <body>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-clinica-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Ir al contenido principal
        </a>
        <ProveedorSesion>{children}</ProveedorSesion>
      </body>
    </html>
  );
}
