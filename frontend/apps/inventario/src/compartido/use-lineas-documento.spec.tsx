import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLineasDocumento, type LineaBase } from './use-lineas-documento';

/**
 * Pruebas del hook de lineas de documento.
 *
 * Lo comparten la pantalla de compras y la de ventas, que antes tenian cada una
 * su copia de la misma logica. Esa duplicacion era el origen de que un arreglo
 * en compras -el control de producto repetido- no llegara nunca a ventas.
 *
 * Es generico sobre el tipo de linea porque compra y venta no llevan los mismos
 * campos: la compra tiene precio, la venta no. Lo que si comparten es el
 * comportamiento del detalle, y eso es lo que se prueba aqui.
 */
describe('useLineasDocumento', () => {
  interface LineaPrueba extends LineaBase {
    cantidad: string;
    precio: string;
  }

  const importesDe = (linea: LineaPrueba) => {
    const subTotal = Number(linea.cantidad) * Number(linea.precio);
    return { subTotal, igv: subTotal * 0.18, total: subTotal * 1.18 };
  };

  const validar = (linea: LineaPrueba): string | null =>
    Number(linea.cantidad) > 0 ? null : 'La cantidad debe ser mayor que cero.';

  const montar = () =>
    renderHook(() => useLineasDocumento<LineaPrueba>({ importesDe, validar }));

  const LINEA = {
    idProducto: 1,
    nombreProducto: 'Paracetamol',
    cantidad: '5',
    precio: '0.49',
  };

  describe('estado inicial', () => {
    it('empieza sin lineas', () => {
      const { result } = montar();

      expect(result.current.lineas).toEqual([]);
      expect(result.current.hayLineas).toBe(false);
    });

    it('los totales de un documento vacio son cero', () => {
      const { result } = montar();

      expect(result.current.totales).toEqual({ subTotal: 0, igv: 0, total: 0 });
    });
  });

  describe('agregar', () => {
    it('anade la linea al detalle', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
      });

      expect(result.current.lineas).toHaveLength(1);
      expect(result.current.hayLineas).toBe(true);
    });

    it('le asigna un identificador de fila propio', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
      });

      // La fila necesita una clave estable para React, y el identificador del
      // producto no sirve como clave si el detalle se reordena.
      expect(result.current.lineas[0]?.idFila).toBeTruthy();
    });

    it('conserva los datos del producto', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
      });

      expect(result.current.lineas[0]).toMatchObject({
        idProducto: 1,
        nombreProducto: 'Paracetamol',
        cantidad: '5',
      });
    });

    it('admite productos distintos', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
        result.current.agregar({ ...LINEA, idProducto: 2, nombreProducto: 'Ibuprofeno' });
      });

      expect(result.current.lineas).toHaveLength(2);
    });

    /*
     * El mismo producto no se puede anadir dos veces. Partir 10 unidades en dos
     * filas de 5 no aporta nada, complica la lectura del documento y obliga al
     * usuario a sumar mentalmente para saber cuanto esta comprando.
     */
    it('rechaza el producto que ya esta en el detalle', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });

      let admitida = true;
      act(() => {
        admitida = result.current.agregar({ ...LINEA, cantidad: '3' });
      });

      expect(admitida).toBe(false);
      expect(result.current.lineas).toHaveLength(1);
    });

    /*
     * Devuelve un booleano en lugar de fallar en silencio. La pantalla lo usa
     * para avisar -"ese producto ya esta en el detalle"- en vez de dejar al
     * usuario pulsando "Agregar" sin entender por que no pasa nada.
     */
    it('devuelve true cuando la admite, para que la pantalla pueda reaccionar', () => {
      const { result } = montar();

      let admitida = false;
      act(() => {
        admitida = result.current.agregar(LINEA);
      });

      expect(admitida).toBe(true);
    });

    /*
     * Dos adiciones del mismo producto en el mismo lote de React. El filtro que
     * decide el valor de retorno lee el estado del ultimo render y no ve la
     * primera adicion, asi que la segunda tambien devolveria true; la guarda
     * dentro del actualizador es la que impide que la linea se duplique de
     * verdad en el estado.
     */
    it('dos adiciones seguidas del mismo producto no duplican la linea', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
        result.current.agregar(LINEA);
      });

      expect(result.current.lineas).toHaveLength(1);
    });

    it('el rechazo no altera la linea que ya estaba', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });

      act(() => {
        result.current.agregar({ ...LINEA, cantidad: '99' });
      });

      // Si el duplicado sobrescribiera la cantidad, el usuario perderia lo que
      // habia escrito sin darse cuenta.
      expect(result.current.lineas[0]?.cantidad).toBe('5');
    });
  });

  describe('actualizar un campo', () => {
    it('cambia solo la linea indicada', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
        result.current.agregar({ ...LINEA, idProducto: 2, nombreProducto: 'Ibuprofeno' });
      });
      const idPrimera = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.actualizarCampo(idPrimera, 'cantidad', '10');
      });

      expect(result.current.lineas[0]?.cantidad).toBe('10');
      expect(result.current.lineas[1]?.cantidad).toBe('5');
    });

    it('no toca los demas campos de esa linea', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });
      const idFila = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.actualizarCampo(idFila, 'cantidad', '10');
      });

      expect(result.current.lineas[0]?.precio).toBe('0.49');
      expect(result.current.lineas[0]?.nombreProducto).toBe('Paracetamol');
    });

    it('un identificador que no existe no cambia nada', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });

      act(() => {
        result.current.actualizarCampo('inexistente', 'cantidad', '99');
      });

      expect(result.current.lineas[0]?.cantidad).toBe('5');
    });

    /*
     * Las cantidades se guardan como TEXTO, no como numero. Es deliberado: un
     * campo numerico permite estados intermedios -vacio, "0.", "1e"- que no son
     * numeros validos pero que el usuario esta escribiendo. Convertir en cada
     * pulsacion borraria lo que acaba de teclear.
     */
    it('acepta valores intermedios mientras se escribe', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });
      const idFila = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.actualizarCampo(idFila, 'cantidad', '');
      });

      expect(result.current.lineas[0]?.cantidad).toBe('');
    });
  });

  describe('quitar y vaciar', () => {
    it('quita la linea indicada', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
        result.current.agregar({ ...LINEA, idProducto: 2 });
      });
      const idPrimera = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.quitar(idPrimera);
      });

      expect(result.current.lineas).toHaveLength(1);
      expect(result.current.lineas[0]?.idProducto).toBe(2);
    });

    it('quitar un identificador inexistente no altera el detalle', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
      });

      act(() => {
        result.current.quitar('inexistente');
      });

      expect(result.current.lineas).toHaveLength(1);
    });

    it('vaciar deja el documento en blanco', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
        result.current.agregar({ ...LINEA, idProducto: 2 });
      });

      act(() => {
        result.current.vaciar();
      });

      // Es lo que se llama tras registrar el documento con exito: deja la
      // pantalla lista para el siguiente sin recargarla.
      expect(result.current.lineas).toEqual([]);
      expect(result.current.hayLineas).toBe(false);
    });

    it('tras vaciar, el producto se puede volver a agregar', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
        result.current.vaciar();
      });

      let admitida = false;
      act(() => {
        admitida = result.current.agregar(LINEA);
      });

      expect(admitida).toBe(true);
    });
  });

  describe('totales', () => {
    it('suman los importes de todas las lineas', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar({ ...LINEA, cantidad: '10', precio: '1' });
        result.current.agregar({
          ...LINEA,
          idProducto: 2,
          cantidad: '5',
          precio: '2',
        });
      });

      expect(result.current.totales.subTotal).toBeCloseTo(20, 2);
    });

    it('se recalculan al cambiar una cantidad', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar({ ...LINEA, cantidad: '1', precio: '10' });
      });
      const idFila = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.actualizarCampo(idFila, 'cantidad', '3');
      });

      // Derivar los totales en lugar de guardarlos en estado es lo que evita
      // que la cabecera muestre un importe distinto del detalle.
      expect(result.current.totales.subTotal).toBeCloseTo(30, 2);
    });

    it('vuelven a cero al vaciar', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar(LINEA);
        result.current.vaciar();
      });

      expect(result.current.totales).toEqual({ subTotal: 0, igv: 0, total: 0 });
    });
  });

  describe('lineas con error', () => {
    /*
     * La lista de lineas invalidas se DERIVA en cada render, no se guarda en
     * estado. Un estado paralelo que hay que recalcular a mano es la via directa
     * a mostrar en rojo una linea que el usuario ya corrigio.
     */
    it('detecta la linea invalida', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar({ ...LINEA, cantidad: '0' });
      });

      expect(result.current.lineasConError).toHaveLength(1);
    });

    it('la linea deja de estar en error en cuanto se corrige', () => {
      const { result } = montar();
      act(() => {
        result.current.agregar({ ...LINEA, cantidad: '0' });
      });
      const idFila = result.current.lineas[0]?.idFila ?? '';

      act(() => {
        result.current.actualizarCampo(idFila, 'cantidad', '5');
      });

      expect(result.current.lineasConError).toHaveLength(0);
    });

    it('un detalle correcto no reporta errores', () => {
      const { result } = montar();

      act(() => {
        result.current.agregar(LINEA);
      });

      expect(result.current.lineasConError).toEqual([]);
    });

    it('expone la funcion de validacion para que la use la fila', () => {
      const { result } = montar();

      // La fila la usa para marcar su propio campo, sin duplicar la regla.
      expect(result.current.validar({ ...LINEA, idFila: 'x', cantidad: '0' })).toMatch(
        /mayor que cero/,
      );
    });
  });
});
