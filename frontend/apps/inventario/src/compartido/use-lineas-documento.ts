'use client';

import { useCallback, useMemo, useState } from 'react';

import { type Importes, sumarImportes } from '@hce/api-cliente';

/**
 * Detalle en edicion de un documento: las lineas de una compra o de una venta.
 *
 * Una compra y una venta son, en la pantalla, el mismo objeto: una lista de
 * lineas que se agregan, se editan, se validan y se suman. Solo cambian los
 * campos de cada linea y la regla que decide si es valida.
 *
 * Tenerlo dos veces ya costo caro: compras y ventas divergieron en la
 * validacion -una senalaba el campo invalido y bloqueaba el boton, la otra no-
 * sin que nadie lo notara hasta una auditoria. Con una sola implementacion, una
 * mejora en el flujo llega a las dos pantallas o a ninguna.
 *
 * Lo que NO entra aqui es la regla de negocio de cada documento. La validacion
 * se recibe como parametro: en compras mira cantidad y costo; en ventas ademas
 * compara contra el stock disponible. El hook orquesta; la regla es de quien la
 * conoce.
 */

/** Lo minimo que toda linea debe tener para que el hook pueda gestionarla. */
export interface LineaBase {
  /** Identidad de la fila en la interfaz. La genera el hook. */
  idFila: string;
  /** Identidad del producto. Es lo que impide agregarlo dos veces. */
  idProducto: number;
  nombreProducto: string;
}

/** Linea tal como la construye la pantalla, aun sin identidad de fila. */
export type LineaNueva<TLinea extends LineaBase> = Omit<TLinea, 'idFila'>;

export interface DetalleDocumento<TLinea extends LineaBase> {
  lineas: readonly TLinea[];
  /** Agrega la linea. Devuelve false si ese producto ya estaba en el detalle. */
  agregar: (linea: LineaNueva<TLinea>) => boolean;
  /** Cambia un campo de texto de una fila concreta. */
  actualizarCampo: (idFila: string, campo: keyof TLinea, valor: string) => void;
  quitar: (idFila: string) => void;
  vaciar: () => void;
  /** Motivo por el que una linea no es valida, o null si lo es. */
  validar: (linea: TLinea) => string | null;
  lineasConError: readonly TLinea[];
  /** Suma de importes de todas las lineas, para el resumen del documento. */
  totales: Importes;
  hayLineas: boolean;
}

interface Opciones<TLinea extends LineaBase> {
  /** Importes de una linea. Cada documento los calcula con sus propios datos. */
  importesDe: (linea: TLinea) => Importes;
  /** Regla de negocio del documento. Devuelve el motivo o null. */
  validar: (linea: TLinea) => string | null;
}

export function useLineasDocumento<TLinea extends LineaBase>({
  importesDe,
  validar,
}: Opciones<TLinea>): DetalleDocumento<TLinea> {
  const [lineas, setLineas] = useState<readonly TLinea[]>([]);

  /*
   * La comprobacion de duplicado se hace FUERA del actualizador de estado, y es
   * importante que asi sea.
   *
   * La version anterior la hacia dentro -`setLineas((actuales) => ...)`- y
   * asignaba el resultado a una variable que despues devolvia. Eso funciona solo
   * mientras React evalue el actualizador de forma ansiosa, que es una
   * optimizacion suya y no una garantia: en cuanto hay actualizaciones
   * encoladas, React lo aplaza hasta el siguiente render y la funcion devuelve
   * el valor inicial. El sintoma era que, tras vaciar el documento, agregar un
   * producto devolvia `false` aunque la linea si se anadia, y la pantalla
   * mostraba "ese producto ya esta en el detalle" sin ser cierto.
   *
   * Leyendo `lineas` del cierre el resultado es inmediato y no depende de
   * cuando React decida procesar la cola.
   *
   * La comprobacion se repite DENTRO del actualizador, y no sobra: el cierre ve
   * el estado del ultimo render, asi que dos adiciones del mismo producto en el
   * mismo lote pasarian las dos por el filtro de fuera. Fuera se decide que
   * responder; dentro se protege el estado.
   */
  const agregar = useCallback(
    (nueva: LineaNueva<TLinea>): boolean => {
      // Repetir el producto en dos filas partiria la cantidad sin motivo: es
      // mas claro ajustar la fila existente.
      const yaEsta = (actuales: readonly TLinea[]): boolean =>
        actuales.some((l) => l.idProducto === nueva.idProducto);

      if (yaEsta(lineas)) return false;

      // Date.now() basta para distinguir filas: se agregan de una en una, por
      // interaccion humana, y el identificador solo vive en la pantalla.
      const linea = {
        ...nueva,
        idFila: `${String(nueva.idProducto)}-${String(Date.now())}`,
      } as TLinea;

      setLineas((actuales) => (yaEsta(actuales) ? actuales : [...actuales, linea]));
      return true;
    },
    [lineas],
  );

  const actualizarCampo = useCallback(
    (idFila: string, campo: keyof TLinea, valor: string): void => {
      setLineas((actuales) =>
        actuales.map((l) => (l.idFila === idFila ? { ...l, [campo]: valor } : l)),
      );
    },
    [],
  );

  const quitar = useCallback((idFila: string): void => {
    setLineas((actuales) => actuales.filter((l) => l.idFila !== idFila));
  }, []);

  const vaciar = useCallback((): void => setLineas([]), []);

  const totales = useMemo(
    () => sumarImportes(lineas.map((l) => importesDe(l))),
    [lineas, importesDe],
  );

  // Se deriva en cada render en vez de guardarse en estado: un estado paralelo
  // que hay que recalcular a mano es la via directa a mostrar el error de una
  // linea que el usuario ya corrigio.
  const lineasConError = lineas.filter((l) => validar(l) !== null);

  return {
    lineas,
    agregar,
    actualizarCampo,
    quitar,
    vaciar,
    validar,
    lineasConError,
    totales,
    hayLineas: lineas.length > 0,
  };
}
