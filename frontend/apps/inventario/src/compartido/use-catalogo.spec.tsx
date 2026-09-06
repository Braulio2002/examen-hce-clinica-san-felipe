import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorApi } from '@hce/api-cliente';

import { useCatalogo } from './use-catalogo';

/**
 * Pruebas del hook de catalogo.
 *
 * Nacio de una duplicacion real: compras, ventas y Kardex repetian el mismo
 * bloque de "cargar, mostrar cargando, capturar el error, poder recargar". Tres
 * copias del mismo codigo son tres sitios donde arreglar el mismo fallo, y en
 * la practica siempre se arregla en dos.
 *
 * Se prueba con `renderHook` en lugar de a traves de una pantalla: asi las
 * pruebas hablan del contrato del hook -que es lo que consumen tres pantallas-
 * y no de como lo pinta una de ellas.
 */
describe('useCatalogo', () => {
  const PRODUCTOS = [
    { idProducto: 1, nombreProducto: 'Paracetamol' },
    { idProducto: 2, nombreProducto: 'Ibuprofeno' },
  ];

  describe('carga inicial', () => {
    it('consulta en cuanto se monta, sin que la pantalla lo pida', async () => {
      const consultar = vi.fn().mockResolvedValue(PRODUCTOS);

      renderHook(() => useCatalogo(consultar, 'fallo'));

      await waitFor(() => {
        expect(consultar).toHaveBeenCalledTimes(1);
      });
    });

    /*
     * Empieza en `cargando: true`, no en false. La diferencia se ve en pantalla:
     * arrancar en false pinta durante un instante el estado vacio -"no hay
     * productos"- antes de que lleguen los datos, y ese parpadeo hace dudar al
     * usuario de si de verdad hay algo.
     */
    it('arranca cargando, para no pintar un vacio que no es real', () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockResolvedValue([]), 'fallo'),
      );

      expect(result.current.cargando).toBe(true);
      expect(result.current.datos).toEqual([]);
    });

    it('deja los datos disponibles al terminar', async () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockResolvedValue(PRODUCTOS), 'fallo'),
      );

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });
      expect(result.current.datos).toEqual(PRODUCTOS);
    });

    it('sin datos deja una lista vacia, no undefined', async () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockResolvedValue([]), 'fallo'),
      );

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });
      // Una lista vacia se puede recorrer; `undefined` rompe el `.map` de la
      // pantalla.
      expect(result.current.datos).toEqual([]);
    });
  });

  describe('errores', () => {
    /*
     * Un `ErrorApi` conserva su mensaje: el servidor lo redacto pensando en
     * quien lo va a leer. Cualquier otro fallo -un TypeError, por ejemplo- se
     * sustituye por el mensaje de respaldo, porque su texto no significa nada
     * para el usuario.
     */
    it('un error de la API conserva su mensaje', async () => {
      const consultar = vi
        .fn()
        .mockRejectedValue(new ErrorApi('PROHIBIDO', 'No tiene permiso', 403));
      const { result } = renderHook(() => useCatalogo(consultar, 'respaldo'));

      await waitFor(() => {
        expect(result.current.error).toBe('No tiene permiso');
      });
    });

    it('un fallo desconocido usa el mensaje de respaldo', async () => {
      const consultar = vi
        .fn()
        .mockRejectedValue(new TypeError('x.map is not a function'));
      const { result } = renderHook(() =>
        useCatalogo(consultar, 'No se pudo cargar el catalogo.'),
      );

      await waitFor(() => {
        expect(result.current.error).toBe('No se pudo cargar el catalogo.');
      });
    });

    /*
     * `cargando` vuelve a false tambien cuando falla, porque esta en un
     * `finally`. Sin eso, un error dejaria el indicador girando para siempre y
     * el usuario esperaria unos datos que no van a llegar.
     */
    it('deja de cargar aunque haya fallado', async () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockRejectedValue(new Error('x')), 'fallo'),
      );

      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });
    });

    it('el error se puede descartar', async () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockRejectedValue(new Error('x')), 'fallo'),
      );
      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      act(() => {
        result.current.limpiarError();
      });

      expect(result.current.error).toBeNull();
    });

    /*
     * La pantalla puede escribir en el mismo hueco de error. Es lo que permite
     * que un fallo al registrar la compra se muestre en el mismo sitio que un
     * fallo al cargar el catalogo, en lugar de tener dos mecanismos paralelos
     * que se pisan.
     */
    it('la pantalla puede reportar su propio error', () => {
      const { result } = renderHook(() =>
        useCatalogo(vi.fn().mockResolvedValue([]), 'fallo'),
      );

      act(() => {
        result.current.reportarError('No se pudo registrar la compra.');
      });

      expect(result.current.error).toBe('No se pudo registrar la compra.');
    });
  });

  describe('recarga', () => {
    it('vuelve a consultar cuando se le pide', async () => {
      const consultar = vi.fn().mockResolvedValue(PRODUCTOS);
      const { result } = renderHook(() => useCatalogo(consultar, 'fallo'));
      await waitFor(() => {
        expect(result.current.cargando).toBe(false);
      });

      await act(async () => {
        await result.current.recargar();
      });

      // Tras registrar una compra hay que refrescar el stock: sin recarga, la
      // pantalla seguiria mostrando las existencias anteriores.
      expect(consultar).toHaveBeenCalledTimes(2);
    });

    it('la recarga trae los datos actualizados', async () => {
      const consultar = vi
        .fn()
        .mockResolvedValueOnce(PRODUCTOS)
        .mockResolvedValueOnce([{ idProducto: 3, nombreProducto: 'Amoxicilina' }]);
      const { result } = renderHook(() => useCatalogo(consultar, 'fallo'));
      await waitFor(() => {
        expect(result.current.datos).toHaveLength(2);
      });

      await act(async () => {
        await result.current.recargar();
      });

      expect(result.current.datos).toEqual([
        { idProducto: 3, nombreProducto: 'Amoxicilina' },
      ]);
    });

    it('un fallo en la recarga se muestra igual', async () => {
      const consultar = vi
        .fn()
        .mockResolvedValueOnce(PRODUCTOS)
        .mockRejectedValueOnce(new ErrorApi('SIN_CONEXION', 'Sin conexion', 0));
      const { result } = renderHook(() => useCatalogo(consultar, 'fallo'));
      await waitFor(() => {
        expect(result.current.datos).toHaveLength(2);
      });

      await act(async () => {
        await result.current.recargar();
      });

      expect(result.current.error).toBe('Sin conexion');
    });

    /*
     * Los datos anteriores se conservan cuando la recarga falla. Vaciar la tabla
     * ante un fallo de red seria destruir informacion util: el usuario prefiere
     * ver datos de hace un minuto con un aviso, a ver una pantalla en blanco.
     */
    it('un fallo en la recarga no borra lo que ya se mostraba', async () => {
      const consultar = vi
        .fn()
        .mockResolvedValueOnce(PRODUCTOS)
        .mockRejectedValueOnce(new Error('sin conexion'));
      const { result } = renderHook(() => useCatalogo(consultar, 'fallo'));
      await waitFor(() => {
        expect(result.current.datos).toHaveLength(2);
      });

      await act(async () => {
        await result.current.recargar();
      });

      expect(result.current.datos).toEqual(PRODUCTOS);
    });
  });
});
