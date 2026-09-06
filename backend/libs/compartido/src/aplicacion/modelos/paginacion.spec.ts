import {
  LIMITES_PAGINACION,
  construirPaginado,
  normalizarPaginacion,
} from './paginacion';

/**
 * Pruebas de la paginacion compartida.
 *
 * `normalizarPaginacion` es una frontera de seguridad, no una comodidad. Los
 * valores que recibe vienen de la cadena de consulta, donde cualquiera escribe
 * lo que quiera: un `tamanoPagina` sin tope permitiria pedir la tabla entera en
 * una llamada y convertir una consulta legitima en una denegacion de servicio.
 *
 * Por eso las pruebas insisten en las entradas hostiles -negativos, cero,
 * decimales, valores enormes, NaN- mas que en el camino feliz.
 */
describe('Paginacion', () => {
  describe('normalizarPaginacion', () => {
    it('respeta una consulta valida', () => {
      expect(normalizarPaginacion({ pagina: 3, tamanoPagina: 50 })).toEqual({
        pagina: 3,
        tamanoPagina: 50,
      });
    });

    it('aplica los valores por defecto cuando no llega nada', () => {
      expect(normalizarPaginacion({})).toEqual({
        pagina: LIMITES_PAGINACION.PAGINA_MINIMA,
        tamanoPagina: LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
      });
    });

    describe('pagina', () => {
      it.each([0, -1, -999])('lleva %p a la pagina minima', (pagina) => {
        expect(normalizarPaginacion({ pagina }).pagina).toBe(
          LIMITES_PAGINACION.PAGINA_MINIMA,
        );
      });

      it('trunca los decimales en vez de redondear', () => {
        expect(normalizarPaginacion({ pagina: 2.9 }).pagina).toBe(2);
      });

      it('cae en la pagina 1 ante un valor no numerico', () => {
        expect(normalizarPaginacion({ pagina: Number.NaN }).pagina).toBe(1);
      });
    });

    describe('tamano de pagina', () => {
      /*
       * El tope es la proteccion real. Sin el, `?tamanoPagina=1000000` haria que
       * el servidor materializara la tabla completa en memoria.
       */
      it('recorta cualquier peticion por encima del maximo', () => {
        expect(normalizarPaginacion({ tamanoPagina: 1_000_000 }).tamanoPagina).toBe(
          LIMITES_PAGINACION.TAMANO_MAXIMO,
        );
      });

      it('admite exactamente el maximo', () => {
        expect(
          normalizarPaginacion({ tamanoPagina: LIMITES_PAGINACION.TAMANO_MAXIMO })
            .tamanoPagina,
        ).toBe(LIMITES_PAGINACION.TAMANO_MAXIMO);
      });

      it.each([0, -5])('usa el valor por defecto ante %p', (tamanoPagina) => {
        expect(normalizarPaginacion({ tamanoPagina }).tamanoPagina).toBe(
          LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
        );
      });

      it('trunca los decimales', () => {
        expect(normalizarPaginacion({ tamanoPagina: 10.7 }).tamanoPagina).toBe(10);
      });

      it('cae en el valor por defecto ante un valor no numerico', () => {
        expect(normalizarPaginacion({ tamanoPagina: Number.NaN }).tamanoPagina).toBe(
          LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
        );
      });
    });
  });

  describe('construirPaginado', () => {
    it('calcula el total de paginas redondeando hacia arriba', () => {
      // 13 registros de 10 en 10 son dos paginas, no una y pico.
      expect(construirPaginado([], 13, 1, 10).meta.totalPaginas).toBe(2);
    });

    it('una division exacta no genera una pagina de mas', () => {
      expect(construirPaginado([], 20, 1, 10).meta.totalPaginas).toBe(2);
    });

    it('sin registros no hay paginas', () => {
      expect(construirPaginado([], 0, 1, 10).meta.totalPaginas).toBe(0);
    });

    it('devuelve los datos y la meta completa', () => {
      const datos = [{ id: 1 }, { id: 2 }];

      expect(construirPaginado(datos, 13, 2, 10)).toEqual({
        datos,
        meta: { pagina: 2, tamanoPagina: 10, totalRegistros: 13, totalPaginas: 2 },
      });
    });

    /*
     * Un tamano de pagina de cero llegaria a una division por cero. La funcion
     * devuelve 0 paginas en vez de Infinity, que es lo que el cliente puede
     * mostrar sin romperse.
     */
    it('no divide por cero si el tamano de pagina es 0', () => {
      expect(construirPaginado([], 13, 1, 0).meta.totalPaginas).toBe(0);
    });
  });

  describe('LIMITES_PAGINACION', () => {
    it('el maximo es mayor que el valor por defecto', () => {
      expect(LIMITES_PAGINACION.TAMANO_MAXIMO).toBeGreaterThan(
        LIMITES_PAGINACION.TAMANO_POR_DEFECTO,
      );
    });

    it('la pagina minima es 1, no 0', () => {
      // La paginacion es de cara al usuario: empieza en 1.
      expect(LIMITES_PAGINACION.PAGINA_MINIMA).toBe(1);
    });
  });
});
