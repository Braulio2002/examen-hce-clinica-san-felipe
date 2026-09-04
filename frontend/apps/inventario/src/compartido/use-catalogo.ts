'use client';

import { useCallback, useEffect, useState } from 'react';

import { ErrorApi } from '@hce/api-cliente';

/**
 * Carga de un catalogo remoto, con sus estados de espera y de fallo.
 *
 * Compras y ventas repetian este bloque casi identico: un `useState` para los
 * datos, otro para la espera, otro para el error, un `useCallback` que envuelve
 * la llamada en try/catch/finally y un `useEffect` que lo dispara. Cambiaba solo
 * el endpoint y el texto del mensaje.
 *
 * Esa repeticion no era gratuita: las dos pantallas llamaban `cargando` y
 * `cargandoCatalogo` a lo mismo, y ese tipo de deriva es lo que acaba
 * produciendo comportamientos distintos donde deberia haber uno.
 *
 * `recargar` se expone a proposito. Tras registrar un documento hay que releer
 * el inventario, y tambien despues de un fallo: el stock pudo cambiarlo otra
 * operacion concurrente, y seguir mostrando el valor viejo induce al usuario a
 * repetir una venta que el servidor ya rechazo.
 */
export interface EstadoCatalogo<T> {
  datos: readonly T[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  limpiarError: () => void;
  /** Permite a la pantalla reportar un error propio por el mismo canal. */
  reportarError: (mensaje: string) => void;
}

export function useCatalogo<T>(
  consultar: () => Promise<readonly T[]>,
  mensajeSiFalla: string,
): EstadoCatalogo<T> {
  const [datos, setDatos] = useState<readonly T[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await consultar());
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.mensaje : mensajeSiFalla);
    } finally {
      setCargando(false);
    }
  }, [consultar, mensajeSiFalla]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return {
    datos,
    cargando,
    error,
    recargar,
    limpiarError: useCallback(() => setError(null), []),
    reportarError: useCallback((mensaje: string) => setError(mensaje), []),
  };
}
