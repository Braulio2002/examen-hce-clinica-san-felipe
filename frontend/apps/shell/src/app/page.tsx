'use client';

import { FilaKardex, formatearMoneda } from '@hce/api-cliente';
import {
  Alerta,
  Boton,
  Cargador,
  ContenedorTabla,
  EtiquetaStock,
  MarcoAplicacion,
  useSesion,
} from '@hce/ui';
import React, { useEffect, useState } from 'react';

import { apiHce } from '@/lib/api';

/** Umbral operativo de reposicion para farmacia. */
const STOCK_MINIMO = 20;

export default function PaginaInicio(): React.JSX.Element {
  const { usuario, puedeOperar } = useSesion();
  const [filas, setFilas] = useState<FilaKardex[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    apiHce.kardex
      .listar({ tamanoPagina: 200 })
      .then((resultado) => {
        if (!cancelado) setFilas(resultado.datos);
      })
      .catch((fallo: Error) => {
        if (!cancelado) setError(fallo.message);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const totalProductos = filas.length;
  const sinStock = filas.filter((f) => f.stockActual <= 0);
  const bajoStock = filas.filter((f) => f.stockActual > 0 && f.stockActual <= STOCK_MINIMO);
  const valorizado = filas.reduce((acc, f) => acc + f.stockActual * f.costo, 0);

  const tarjetas = [
    { etiqueta: 'Productos activos', valor: String(totalProductos), tono: 'text-slate-900' },
    { etiqueta: 'Stock bajo', valor: String(bajoStock.length), tono: 'text-amber-600' },
    { etiqueta: 'Sin stock', valor: String(sinStock.length), tono: 'text-rose-600' },
    { etiqueta: 'Inventario valorizado', valor: formatearMoneda(valorizado), tono: 'text-clinica-700' },
  ];

  const requierenAtencion = [...sinStock, ...bajoStock].slice(0, 8);

  return (
    <MarcoAplicacion
      titulo={usuario ? `Hola, ${usuario.nombreCompleto.split(' ')[0]}` : 'Inicio'}
      descripcion="Panorama del almacen de medicamentos e insumos medicos."
      acciones={
        puedeOperar ? (
          <>
            <Boton variante="secundario" onClick={() => (window.location.href = '/inventario/compras')}>
              Registrar compra
            </Boton>
            <Boton onClick={() => (window.location.href = '/inventario/ventas')}>
              Registrar venta
            </Boton>
          </>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-6">
          <Alerta tipo="error" titulo="No se pudo cargar el resumen">
            {error}
          </Alerta>
        </div>
      )}

      <section aria-label="Indicadores del almacen" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.etiqueta} className="tarjeta">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t.etiqueta}
            </p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${t.tono}`}>
              {cargando ? '—' : t.valor}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="titulo-reposicion" className="mt-8">
        <h2 id="titulo-reposicion" className="mb-3 text-base font-semibold text-slate-900">
          Requieren reposicion
        </h2>

        {cargando ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Cargador className="h-6 w-6" />
          </div>
        ) : requierenAtencion.length === 0 ? (
          <div className="tarjeta">
            <p className="text-sm text-slate-500">
              Ningun producto esta por debajo del umbral de {STOCK_MINIMO} unidades.
            </p>
          </div>
        ) : (
          <ContenedorTabla>
            <table className="tabla-hce">
              <caption className="sr-only">
                Productos sin stock o por debajo de {STOCK_MINIMO} unidades
              </caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Lote</th>
                  <th scope="col" className="text-right">Stock</th>
                  <th scope="col" className="text-right">Costo</th>
                  <th scope="col" className="text-right">Precio venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requierenAtencion.map((f) => (
                  <tr key={f.idProducto}>
                    <td className="font-medium text-slate-900">{f.nombreProducto}</td>
                    <td className="text-slate-500">{f.nroLote}</td>
                    <td className="text-right">
                      <EtiquetaStock stock={f.stockActual} />
                    </td>
                    <td className="text-right tabular-nums">{formatearMoneda(f.costo)}</td>
                    <td className="text-right tabular-nums">{formatearMoneda(f.precioVenta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        )}
      </section>
    </MarcoAplicacion>
  );
}
