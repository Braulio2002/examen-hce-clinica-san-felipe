import { PATRONES_AUTH } from '@hce/compartido';

import type { AutenticacionFachada } from '../../aplicacion/fachadas/autenticacion.fachada';

import { AuthControlador } from './auth.controlador';

/**
 * Pruebas del controlador RPC de autenticacion.
 *
 * Solo traduce el mensaje a una llamada a la fachada. Lo que se comprueba es el
 * cableado y, sobre todo, que el controlador no toque las credenciales: si
 * registrara la peticion o la transformara, la contrasena en claro acabaria en
 * algun sitio donde no debe.
 */
describe('AuthControlador (RPC)', () => {
  const fachada = () =>
    ({
      autenticar: jest.fn().mockResolvedValue({ accessToken: 'tok' }),
      perfil: jest.fn().mockResolvedValue({ id: 1, username: 'admin' }),
      // El controlador depende de la clase concreta, con campos privados; la
      // conversion deja el doble en un unico punto explicito.
    }) as unknown as jest.Mocked<AutenticacionFachada>;

  it('iniciarSesion delega en la fachada', async () => {
    const doble = fachada();
    const credenciales = { username: 'admin', password: 'Clinica2026$' };

    await new AuthControlador(doble).iniciarSesion(credenciales);

    expect(doble.autenticar).toHaveBeenCalledWith(credenciales);
  });

  it('devuelve la sesion tal cual la produce la fachada', async () => {
    const doble = fachada();
    const sesion = { accessToken: 'tok', expiraEnSegundos: 1800 };
    doble.autenticar.mockResolvedValue(
      sesion as Awaited<ReturnType<AutenticacionFachada['autenticar']>>,
    );

    await expect(
      new AuthControlador(doble).iniciarSesion({ username: 'a', password: 'b' }),
    ).resolves.toBe(sesion);
  });

  it('perfil delega en la fachada', async () => {
    const doble = fachada();

    await new AuthControlador(doble).perfil({ username: 'admin' });

    expect(doble.perfil).toHaveBeenCalledWith({ username: 'admin' });
  });

  /*
   * El error de credenciales sube sin capturar. El filtro RPC del borde lo
   * traduce a 401 con un mensaje generico; capturarlo aqui obligaria a repetir
   * esa traduccion en cada controlador.
   */
  it('deja subir el fallo de autenticacion', async () => {
    const doble = fachada();
    const fallo = new Error('Credenciales invalidas');
    doble.autenticar.mockRejectedValue(fallo);

    await expect(
      new AuthControlador(doble).iniciarSesion({ username: 'a', password: 'mal' }),
    ).rejects.toBe(fallo);
  });

  it('los patrones de autenticacion estan declarados y son distintos', () => {
    const patrones = Object.values(PATRONES_AUTH);

    expect(patrones.length).toBeGreaterThanOrEqual(2);
    expect(new Set(patrones).size).toBe(patrones.length);
  });
});
