import type { ConfigService } from '@nestjs/config';
import type { ClientProxy } from '@nestjs/microservices';
import type { CookieOptions, Response } from 'express';
import { of } from 'rxjs';

import type { UsuarioAutenticado } from '../seguridad/estrategias/jwt.estrategia';

import { AuthControlador } from './auth.controlador';

/**
 * Pruebas del controlador de autenticacion del gateway.
 *
 * Es el controlador con mas decisiones propias de los cinco, porque es el unico
 * que manipula la cookie de sesion. El resto solo traduce HTTP a RPC.
 *
 * Las opciones de esa cookie son seguridad, no configuracion decorativa:
 *
 *   - `httpOnly` impide que JavaScript la lea. Es lo que hace que un XSS no se
 *     convierta en un robo de sesion. Sin ella, guardar el token en cookie no
 *     aporta nada frente a guardarlo en localStorage.
 *   - `sameSite` la deja fuera de las peticiones cruzadas, que es la defensa
 *     contra CSRF.
 *   - `secure` obliga a HTTPS, y por eso es configurable: en desarrollo local no
 *     hay certificado y la cookie no llegaria nunca.
 *
 * Cada una tiene su prueba porque las tres se rompen en silencio: la aplicacion
 * sigue funcionando igual de bien con la cookie mal protegida.
 */
describe('AuthControlador (gateway)', () => {
  const sesion = {
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.carga.firma',
    expiraEnSegundos: 1800,
    usuario: {
      id: 1,
      username: 'admin',
      nombreCompleto: 'Administrador del Sistema',
      rol: 'ADMIN',
    },
  };

  const cliente = (respuesta: unknown = sesion) => {
    const send = jest.fn().mockReturnValue(of(respuesta));
    return { doble: { send } as unknown as ClientProxy, send };
  };

  const configuracion = (valores: Record<string, string> = {}) =>
    ({
      get: (clave: string, porDefecto?: string) =>
        clave in valores ? valores[clave] : porDefecto,
    }) as unknown as ConfigService;

  const respuestaHttp = () => {
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    return { doble: { cookie, clearCookie } as unknown as Response, cookie, clearCookie };
  };

  /**
   * Extrae las opciones de la cookie. Express las coloca en la tercera posicion
   * al escribirla -`cookie(nombre, valor, opciones)`- y en la segunda al
   * borrarla, porque ahi no hay valor: `clearCookie(nombre, opciones)`.
   */
  const opcionesEscritas = (espia: jest.Mock): CookieOptions =>
    (espia.mock.calls[0]?.[2] ?? {}) as CookieOptions;

  const opcionesBorrado = (espia: jest.Mock): CookieOptions =>
    (espia.mock.calls[0]?.[1] ?? {}) as CookieOptions;

  describe('login', () => {
    it('reenvia las credenciales al microservicio de autenticacion', async () => {
      const { doble, send } = cliente();

      await new AuthControlador(doble, configuracion()).login(
        { username: 'admin', password: 'Clinica2026$' },
        respuestaHttp().doble,
      );

      expect(send.mock.calls[0]?.[1]).toMatchObject({
        username: 'admin',
        password: 'Clinica2026$',
      });
    });

    it('devuelve la sesion en el cuerpo, para clientes que no usan cookies', async () => {
      const { doble } = cliente();

      // Postman y las pruebas de humo leen el token del cuerpo; el navegador usa
      // la cookie. Se soportan los dos sin que el servidor tenga que elegir.
      await expect(
        new AuthControlador(doble, configuracion()).login(
          { username: 'admin', password: 'x' },
          respuestaHttp().doble,
        ),
      ).resolves.toEqual(sesion);
    });

    it('deja el token en una cookie con el nombre configurado', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion({ JWT_COOKIE: 'otra' })).login(
        { username: 'admin', password: 'x' },
        res,
      );

      expect(cookie.mock.calls[0]?.[0]).toBe('otra');
      expect(cookie.mock.calls[0]?.[1]).toBe(sesion.accessToken);
    });

    /*
     * Sin httpOnly, cualquier script inyectado en la pagina podria leer
     * `document.cookie` y llevarse la sesion. Es la unica de las tres opciones
     * que no tiene alternativa: no se puede compensar en otra capa.
     */
    it('la cookie es httpOnly: un XSS no puede leerla', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion()).login(
        { username: 'admin', password: 'x' },
        res,
      );

      expect(opcionesEscritas(cookie).httpOnly).toBe(true);
    });

    it('la cookie no viaja en peticiones cruzadas: defensa contra CSRF', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion()).login(
        { username: 'admin', password: 'x' },
        res,
      );

      expect(opcionesEscritas(cookie).sameSite).toBe('lax');
    });

    /*
     * `secure` es configurable y por defecto esta apagado, lo cual seria un
     * defecto si no fuera porque en desarrollo local no hay HTTPS y la cookie
     * simplemente no se enviaria. La prueba fija ambos comportamientos para que
     * quede claro que el valor de produccion es una decision de despliegue.
     */
    it('exige HTTPS cuando se configura COOKIE_SEGURA', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion({ COOKIE_SEGURA: 'true' })).login(
        { username: 'admin', password: 'x' },
        res,
      );

      expect(opcionesEscritas(cookie).secure).toBe(true);
    });

    it('no exige HTTPS por defecto, para poder desarrollar en local', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion()).login(
        { username: 'admin', password: 'x' },
        res,
      );

      expect(opcionesEscritas(cookie).secure).toBe(false);
    });

    it('la cookie caduca a la vez que el token', async () => {
      const { doble } = cliente();
      const { doble: res, cookie } = respuestaHttp();

      await new AuthControlador(doble, configuracion()).login(
        { username: 'admin', password: 'x' },
        res,
      );

      // En milisegundos, porque asi lo espera Express; el token cuenta segundos.
      // Si no coincidieran, quedaria una cookie viva con un token ya invalido.
      expect(opcionesEscritas(cookie).maxAge).toBe(1800 * 1000);
    });
  });

  describe('logout', () => {
    it('borra la cookie de sesion', () => {
      const { doble: res, clearCookie } = respuestaHttp();

      new AuthControlador(cliente().doble, configuracion()).logout(res);

      expect(clearCookie).toHaveBeenCalledTimes(1);
      expect(clearCookie.mock.calls[0]?.[0]).toBe('hce_access_token');
    });

    /*
     * El borrado tiene que repetir las mismas opciones con las que se creo la
     * cookie. Un `path` distinto y el navegador guarda una cookie nueva vacia
     * en lugar de borrar la que habia: la sesion seguiria viva.
     */
    it('borra con las mismas opciones con las que se creo', () => {
      const { doble: res, clearCookie } = respuestaHttp();

      new AuthControlador(cliente().doble, configuracion()).logout(res);

      expect(opcionesBorrado(clearCookie)).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    });

    it('confirma al cliente que la sesion termino', () => {
      const resultado = new AuthControlador(cliente().doble, configuracion()).logout(
        respuestaHttp().doble,
      );

      expect(resultado).toEqual({ mensaje: 'Sesion finalizada.' });
    });
  });

  describe('perfil', () => {
    const usuario: UsuarioAutenticado = {
      id: 1,
      username: 'admin',
      nombre: 'Administrador del Sistema',
      rol: 'ADMIN',
      expiraEn: new Date('2026-09-30T00:00:00Z'),
    };

    /*
     * El perfil se resuelve contra la base y no se devuelve lo que trae el
     * token. Cuesta una llamada mas, pero significa que desactivar una cuenta
     * surte efecto de inmediato en lugar de esperar a que caduque su token.
     */
    it('consulta el perfil al microservicio en lugar de leerlo del token', async () => {
      const { doble, send } = cliente({ id: 1, username: 'admin' });

      await new AuthControlador(doble, configuracion()).perfil(usuario);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[1]).toMatchObject({ username: 'admin' });
    });

    it('identifica al usuario por su nombre de sesion, no por un dato del cliente', async () => {
      const { doble, send } = cliente({ id: 1 });

      await new AuthControlador(doble, configuracion()).perfil(usuario);

      // El username sale del token ya validado. Si viniera de la peticion,
      // cualquiera podria pedir el perfil de otro.
      const enviado = send.mock.calls[0]?.[1] as { username: string };
      expect(enviado.username).toBe(usuario.username);
    });
  });
});
