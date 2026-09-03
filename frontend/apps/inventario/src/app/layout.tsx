import type { Metadata, Viewport } from 'next';
import { ProveedorSesion } from '@hce/ui';
import React from 'react';

import '@/lib/api';

import './globals.css';

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
}: {
  children: React.ReactNode;
}): React.JSX.Element {
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
