import type { Metadata, Viewport } from 'next';
import type React from 'react';

import { ProveedorSesion } from '@hce/ui';

import '@/lib/api';

import './globals.css';

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
        <ProveedorSesion>{children}</ProveedorSesion>
      </body>
    </html>
  );
}
