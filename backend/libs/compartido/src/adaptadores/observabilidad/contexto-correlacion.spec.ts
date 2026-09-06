import {
  conCorrelacion,
  correlacionDesdePayload,
  ejecutarConCorrelacion,
  nuevaCorrelacion,
  obtenerCorrelacion,
} from './contexto-correlacion';

/**
 * Pruebas del contexto de correlacion.
 *
 * Es lo que permite seguir una peticion a traves de los cuatro servicios. El
 * identificador se guarda en un AsyncLocalStorage, de modo que cualquier codigo
 * dentro de la peticion puede leerlo sin que haya que pasarlo como argumento por
 * toda la cadena de llamadas.
 *
 * Lo dificil de este mecanismo es que se rompe en silencio. Si el contexto no se
 * propaga bien a traves de un `await`, no falla nada: simplemente los registros
 * del microservicio dejan de poder cruzarse con los del gateway, y eso solo se
 * descubre el dia que hay que investigar un fallo. Por eso hay pruebas
 * explicitas de propagacion asincrona y de aislamiento entre peticiones.
 */
describe('Contexto de correlacion', () => {
  describe('nuevaCorrelacion', () => {
    it('genera un identificador con formato UUID', () => {
      expect(nuevaCorrelacion()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('no repite identificadores', () => {
      const generados = new Set(Array.from({ length: 100 }, () => nuevaCorrelacion()));

      expect(generados.size).toBe(100);
    });
  });

  describe('ejecutarConCorrelacion / obtenerCorrelacion', () => {
    it('el codigo de dentro ve el identificador', () => {
      ejecutarConCorrelacion('abc-123', () => {
        expect(obtenerCorrelacion()).toBe('abc-123');
      });
    });

    it('fuera del contexto no hay identificador', () => {
      expect(obtenerCorrelacion()).toBeUndefined();
    });

    /*
     * Esta es la prueba que de verdad justifica usar AsyncLocalStorage en lugar
     * de una variable de modulo. El identificador tiene que sobrevivir a los
     * `await`, porque entre uno y otro el proceso atiende otras peticiones. Una
     * variable global se sobrescribiria y las trazas se mezclarian.
     */
    it('sobrevive a los await de la operacion', async () => {
      await ejecutarConCorrelacion('abc-123', async () => {
        await Promise.resolve();
        await new Promise((resolver) => setImmediate(resolver));

        expect(obtenerCorrelacion()).toBe('abc-123');
      });
    });

    /*
     * Dos peticiones concurrentes no deben verse la una a la otra. Se lanzan
     * entrelazadas a proposito: si el almacenamiento no estuviera realmente
     * aislado por contexto asincrono, la segunda pisaria a la primera.
     */
    it('dos operaciones concurrentes no se mezclan', async () => {
      const observado: string[] = [];

      const operacion = (identificador: string, esperaMs: number) =>
        ejecutarConCorrelacion(identificador, async () => {
          await new Promise((resolver) => setTimeout(resolver, esperaMs));
          observado.push(obtenerCorrelacion() ?? 'perdido');
        });

      await Promise.all([operacion('primera', 20), operacion('segunda', 0)]);

      expect(observado.toSorted((a, b) => a.localeCompare(b))).toEqual([
        'primera',
        'segunda',
      ]);
    });

    it('devuelve lo que devuelva la operacion', () => {
      expect(ejecutarConCorrelacion('abc', () => 42)).toBe(42);
    });

    it('el contexto se cierra al terminar', () => {
      ejecutarConCorrelacion('abc', () => obtenerCorrelacion());

      expect(obtenerCorrelacion()).toBeUndefined();
    });
  });

  describe('correlacionDesdePayload', () => {
    /*
     * El transporte TCP de NestJS no tiene cabeceras ni metadatos, asi que el
     * identificador viaja dentro del propio mensaje. Este par de funciones
     * -`conCorrelacion` al enviar, `correlacionDesdePayload` al recibir- es lo
     * que cose la traza entre el gateway y los microservicios.
     */
    it('recupera el identificador que venia en el mensaje', () => {
      expect(correlacionDesdePayload({ correlacion: 'abc-123', idProducto: 1 })).toBe(
        'abc-123',
      );
    });

    it.each([
      ['el mensaje no lo trae', { idProducto: 1 }],
      ['el mensaje es null', null],
      ['el mensaje no es un objeto', 'texto suelto'],
      ['viene vacio', { correlacion: '' }],
      ['no es una cadena', { correlacion: 42 }],
    ])('genera uno nuevo si %s', (_caso, payload) => {
      // Nunca devuelve undefined: una traza rota es peor que una traza que
      // empieza tarde, porque deja las lineas del microservicio sin agrupar.
      expect(correlacionDesdePayload(payload)).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('conCorrelacion', () => {
    it('anade el identificador activo al mensaje', () => {
      ejecutarConCorrelacion('abc-123', () => {
        expect(conCorrelacion({ idProducto: 1 })).toEqual({
          idProducto: 1,
          correlacion: 'abc-123',
        });
      });
    });

    it('no modifica el mensaje original', () => {
      const original = { idProducto: 1 };

      ejecutarConCorrelacion('abc-123', () => conCorrelacion(original));

      // Inmutabilidad: se devuelve una copia. Mutar el argumento haria que el
      // identificador se colara en objetos reutilizados por quien llamo.
      expect(original).toEqual({ idProducto: 1 });
    });

    it('deja el mensaje intacto si no hay contexto activo', () => {
      const payload = { idProducto: 1 };

      expect(conCorrelacion(payload)).toBe(payload);
    });

    it.each([
      ['null', null],
      ['un numero', 7],
      ['una cadena', 'texto'],
    ])('devuelve tal cual un mensaje que es %s', (_caso, payload) => {
      ejecutarConCorrelacion('abc-123', () => {
        // Solo se puede envolver un objeto. Un patron RPC que manda un escalar
        // se deja pasar sin tocar en lugar de romperlo.
        expect(conCorrelacion(payload)).toBe(payload);
      });
    });
  });
});
