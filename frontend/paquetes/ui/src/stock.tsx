'use client';

import type React from 'react';

/**
 * Semantica visual del stock para farmacia.
 *
 * El estado se comunica con color Y con texto: apoyarse solo en el color deja
 * fuera a quien no lo distingue.
 */

/** Umbral operativo por debajo del cual farmacia debe reponer. */
const STOCK_BAJO = 20;

/**
 * Estado visual del stock.
 *
 * Se expresa como funcion con salidas tempranas y no como ternario anidado: los
 * tres tramos son una regla operativa de farmacia, y leerlos en vertical hace
 * evidente donde esta cada umbral.
 */
function estadoDelStock(stock: number): { texto: string; clases: string } {
  if (stock <= 0) {
    return { texto: 'Sin stock', clases: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
  }
  if (stock <= STOCK_BAJO) {
    return {
      texto: `${stock} (bajo)`,
      clases: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    };
  }
  return {
    texto: String(stock),
    clases: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  };
}

export function EtiquetaStock({ stock }: Readonly<{ stock: number }>): React.JSX.Element {
  const { texto, clases } = estadoDelStock(stock);

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${clases}`}
    >
      {texto}
    </span>
  );
}
