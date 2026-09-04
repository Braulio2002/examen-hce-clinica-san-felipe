import type { Metadata, Viewport } from 'next';
import type React from 'react';

import { ProveedorSesion } from '@hce/ui';

import { URL_API } from '@/compartido/api';

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
  title: {
    default: 'HCE Insumos | Clinica San Felipe',
    template: '%s | HCE Insumos',
  },
  description:
    'Gestion de medicamentos e insumos medicos en las atenciones clinicas: compras, ventas y Kardex.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: limitar el zoom perjudica a quien necesita ampliar.
  themeColor: '#0c9457',
};

export default function LayoutRaiz({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="es-PE">
      <body>
        {/* Enlace de salto: primer elemento tabulable, util con teclado. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-clinica-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Ir al contenido principal
        </a>
        <ProveedorSesion urlApi={URL_API}>{children}</ProveedorSesion>
      </body>
    </html>
  );
}
