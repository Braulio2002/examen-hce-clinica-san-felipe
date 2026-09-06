import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { extraerDeCookie, JwtEstrategia, type PayloadJwt } from './jwt.estrategia';

/**
 * Pruebas de la estrategia de validacion del token.
 *
 * Se prueban dos cosas separadas:
 *
 *   1. La CONFIGURACION con la que se construye. Es codigo que se ejecuta una
 *      sola vez al arrancar y que nadie vuelve a mirar, pero un `ignoreExpiration`
 *      en true o un algoritmo de mas convierten la autenticacion en decorativa.
 *      Se comprueba leyendo lo que la estrategia le pide al servicio de
 *      configuracion.
 *
 *   2. El metodo `validate`, que traduce la carga del token a la identidad que
 *      veran los controladores.
 */
describe('JwtEstrategia', () => {
  const configuracion = (valores: Record<string, string> = {}) => {
    const get = jest
      .fn()
      .mockImplementation((clave: string, porDefecto?: string) =>
        clave in valores ? valores[clave] : porDefecto,
      );
    const getOrThrow = jest.fn().mockImplementation((clave: string) => {
      const valor = valores[clave];
      if (valor === undefined) throw new Error(`Falta la configuracion ${clave}.`);
      return valor;
    });

    return { doble: { get, getOrThrow } as unknown as ConfigService, get, getOrThrow };
  };

  const SECRETO = { JWT_SECRET: 'secreto-de-prueba-suficientemente-largo' };

  const payload = (parcial: Partial<PayloadJwt> = {}): PayloadJwt => ({
    sub: 1,
    username: 'admin',
    nombre: 'Administrador del Sistema',
    rol: 'ADMIN',
    iat: 1_757_000_000,
    exp: 1_757_001_800,
    ...parcial,
  });

  describe('configuracion al arrancar', () => {
    /*
     * El secreto se pide con `getOrThrow` y no con `get`. La diferencia es que
     * el servicio no arranca si falta, en lugar de arrancar con `undefined` y
     * aceptar tokens sin firma valida. Es la diferencia entre un fallo ruidoso
     * al desplegar y un agujero silencioso en produccion.
     */
    it('exige el secreto: sin el, el servicio no arranca', () => {
      const { doble } = configuracion({});

      expect(() => new JwtEstrategia(doble)).toThrow(/JWT_SECRET/);
    });

    it('lee el secreto de forma obligatoria, no opcional', () => {
      const { doble, getOrThrow } = configuracion(SECRETO);

      expect(new JwtEstrategia(doble)).toBeInstanceOf(JwtEstrategia);
      expect(getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('emisor, audiencia y nombre de cookie tienen valor por defecto', () => {
      const { doble, get } = configuracion(SECRETO);

      expect(new JwtEstrategia(doble)).toBeInstanceOf(JwtEstrategia);
      expect(get).toHaveBeenCalledWith('JWT_ISSUER', 'hce-clinica-san-felipe');
      expect(get).toHaveBeenCalledWith('JWT_AUDIENCE', 'hce-frontend');
      expect(get).toHaveBeenCalledWith('JWT_COOKIE', 'hce_access_token');
    });

    it('el nombre de la cookie se puede cambiar por configuracion', () => {
      const { doble, get } = configuracion({ ...SECRETO, JWT_COOKIE: 'otra_cookie' });

      // El valor por defecto se pasa igualmente: el servicio devuelve el
      // configurado cuando existe, y este por defecto cuando no.
      expect(new JwtEstrategia(doble)).toBeInstanceOf(JwtEstrategia);
      expect(get).toHaveBeenCalledWith('JWT_COOKIE', 'hce_access_token');
    });
  });

  /*
   * El token se acepta desde dos fuentes: la cookie HttpOnly, que es lo que usa
   * el FrontEnd, y la cabecera Authorization, para Postman y clientes que no
   * manejan cookies. La primera es la que importa para la seguridad: al no ser
   * accesible desde JavaScript, un XSS no puede robarla.
   *
   * `Request.cookies` solo existe si cookie-parser esta registrado, asi que la
   * lectura tiene que ser defensiva de verdad. Si un despliegue olvidara ese
   * middleware, lo correcto es que la autenticacion falle limpiamente y caiga a
   * la cabecera, no que el gateway se caiga con "no se puede leer de undefined"
   * en cada peticion.
   */
  describe('extraccion del token desde la cookie', () => {
    const peticionCon = (cookies: unknown): Request =>
      ({ cookies }) as unknown as Request;

    it('devuelve el token cuando la cookie existe', () => {
      expect(
        extraerDeCookie(
          peticionCon({ hce_access_token: 'token-123' }),
          'hce_access_token',
        ),
      ).toBe('token-123');
    });

    it('devuelve null si esa cookie no esta entre las presentes', () => {
      expect(extraerDeCookie(peticionCon({ otra: 'x' }), 'hce_access_token')).toBeNull();
    });

    it.each([
      ['no hay cookies en la peticion', undefined],
      ['cookies es null', null],
      ['cookies no es un objeto', 'no soy un objeto'],
    ])('devuelve null si %s', (_caso, cookies) => {
      // Es el escenario de un despliegue sin cookie-parser: se cae con
      // elegancia a la cabecera Authorization en lugar de romper la peticion.
      expect(extraerDeCookie(peticionCon(cookies), 'hce_access_token')).toBeNull();
    });

    it('devuelve null si el valor de la cookie no es una cadena', () => {
      expect(
        extraerDeCookie(peticionCon({ hce_access_token: 42 }), 'hce_access_token'),
      ).toBeNull();
    });

    it('lee el nombre de cookie que se le pida', () => {
      expect(extraerDeCookie(peticionCon({ otro_nombre: 'tok' }), 'otro_nombre')).toBe(
        'tok',
      );
    });
  });

  describe('validate', () => {
    const estrategia = () => new JwtEstrategia(configuracion(SECRETO).doble);

    it('traduce la carga del token a la identidad de la aplicacion', () => {
      expect(estrategia().validate(payload())).toEqual({
        id: 1,
        username: 'admin',
        nombre: 'Administrador del Sistema',
        rol: 'ADMIN',
        expiraEn: new Date(1_757_001_800 * 1000),
      });
    });

    /*
     * `exp` viene en segundos desde epoch, como manda el RFC 7519; JavaScript
     * cuenta en milisegundos. Olvidar el factor de mil da una fecha de 1970 y
     * hace que toda sesion parezca caducada.
     */
    it('convierte la caducidad de segundos a milisegundos', () => {
      const identidad = estrategia().validate(payload({ exp: 1_800_000_000 }));

      expect(identidad.expiraEn.getUTCFullYear()).toBeGreaterThan(2020);
    });

    it('conserva el rol, que es lo que usara el guardia de autorizacion', () => {
      expect(estrategia().validate(payload({ rol: 'FARMACIA' })).rol).toBe('FARMACIA');
    });

    /*
     * Un token bien firmado pero sin sujeto no identifica a nadie. Podria
     * ocurrir con un token emitido por otro sistema que comparta el secreto por
     * error. Rechazarlo aqui evita que llegue a los controladores un usuario
     * con `id: undefined`.
     */
    it.each([
      ['no trae sujeto', { sub: 0 }],
      ['no trae nombre de usuario', { username: '' }],
    ])('rechaza el token que %s', (_caso, parcial) => {
      expect(() => estrategia().validate(payload(parcial))).toThrow(
        UnauthorizedException,
      );
    });
  });
});
