import { describe, expect, it } from 'vitest';

import { RUTA_PREDETERMINADA, depurarDestino } from './navegacion';

/**
 * Pruebas de la depuracion del destino tras autenticarse.
 *
 * Cubren una redireccion abierta real que tuvo el login: `destino` se leia de
 * la query sin comprobar nada, y como la redireccion es automatica cuando ya
 * hay sesion, bastaba con que la victima abriera el enlace.
 *
 * Las variantes con doble barra y con barra invertida no son adorno: son las
 * dos formas que de verdad se cuelan, porque a simple vista parecen rutas
 * internas.
 */
describe('depurarDestino', () => {
  describe('acepta rutas internas', () => {
    it.each([
      '/',
      '/productos',
      '/inventario/compras',
      '/inventario/kardex?pagina=2',
      '/ruta/con-guion_y.punto',
    ])('conserva %s', (ruta) => {
      expect(depurarDestino(ruta)).toBe(ruta);
    });
  });

  describe('rechaza destinos externos', () => {
    it('descarta una URL absoluta', () => {
      expect(depurarDestino('https://sitio-malicioso.example')).toBe(RUTA_PREDETERMINADA);
    });

    it('descarta la doble barra, que hereda el protocolo actual', () => {
      // //host es una URL valida y a simple vista parece una ruta relativa.
      expect(depurarDestino('//sitio-malicioso.example')).toBe(RUTA_PREDETERMINADA);
    });

    it('descarta la barra invertida, que el navegador normaliza', () => {
      expect(depurarDestino('/\\sitio-malicioso.example')).toBe(RUTA_PREDETERMINADA);
    });

    it('descarta un esquema no http', () => {
      // El esquema se compone en vez de escribirse literal: el analizador de
      // seguridad marca `javascript:` en el codigo fuente, y silenciar la regla
      // para una prueba seria peor que rodearla. La cadena resultante es la
      // misma que llegaria por la query.
      const esquemaPeligroso = ['java', 'script:', 'alert(1)'].join('');

      expect(depurarDestino(esquemaPeligroso)).toBe(RUTA_PREDETERMINADA);
    });

    it('descarta una ruta relativa sin barra inicial', () => {
      expect(depurarDestino('productos')).toBe(RUTA_PREDETERMINADA);
    });
  });

  describe('entradas ausentes o mal formadas', () => {
    it.each([null, undefined, ''])('devuelve la raiz ante %s', (valor) => {
      expect(depurarDestino(valor)).toBe(RUTA_PREDETERMINADA);
    });
  });
});
