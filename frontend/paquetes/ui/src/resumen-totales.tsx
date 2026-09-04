'use client';

import type React from 'react';

import { formatearMoneda, type Importes } from '@hce/api-cliente';

/**
 * Resumen de subtotal, IGV y total de un documento.
 *
 * Vive aqui porque el bloque era identico carACter por carACter en las
 * pantallas de compras y de ventas. Esa duplicacion no era gratuita: las dos
 * pantallas son gemelas y ya habian divergido en otras cosas por copiarse en
 * lugar de compartir.
 *
 * Los importes que se muestran son de presentacion. Los que se guardan son
 * siempre los que devuelve el servidor: el FrontEnd envia cantidad y producto,
 * nunca un importe calculado en el navegador.
 */
export function ResumenTotales({
  totales,
}: Readonly<{ totales: Importes }>): React.JSX.Element {
  return (
    <div className="tarjeta w-full sm:max-w-xs">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd className="tabular-nums text-slate-900">
            {formatearMoneda(totales.subTotal)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">IGV</dt>
          <dd className="tabular-nums text-slate-900">{formatearMoneda(totales.igv)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5">
          <dt className="font-semibold text-slate-900">Total</dt>
          <dd className="font-semibold tabular-nums text-clinica-700">
            {formatearMoneda(totales.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
