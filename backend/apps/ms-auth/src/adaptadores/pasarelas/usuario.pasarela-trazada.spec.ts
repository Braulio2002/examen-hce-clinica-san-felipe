import type { RegistroPuerto } from '@hce/compartido';

import type { UsuarioRepositorio } from '../../aplicacion/puertos/salida/usuario.repositorio';
import { Usuario } from '../../dominio/entidades/usuario.entidad';

import { UsuarioPasarelaTrazada } from './usuario.pasarela-trazada';

/**
 * Pruebas del decorador de trazas del repositorio de usuarios.
 *
 * Ademas de medir la duracion, deja constancia de los intentos de login contra
 * usuarios que no existen. Es informacion util: una racha de ellos es la firma
 * de un ataque por fuerza bruta enumerando nombres.
 */
describe('UsuarioPasarelaTrazada', () => {
  const usuario = new Usuario(1, 'admin', 'Administrador', 'ADMIN', true, '$2a$10$h');

  const registro = (): jest.Mocked<RegistroPuerto> => ({
    depurar: jest.fn(),
    informar: jest.fn(),
    advertir: jest.fn(),
    error: jest.fn(),
  });

  const repositorio = (resultado: Usuario | null = usuario) =>
    ({
      buscarPorUsername: jest.fn().mockResolvedValue(resultado),
    }) as jest.Mocked<UsuarioRepositorio>;

  it('devuelve el usuario del repositorio sin tocarlo', async () => {
    const interno = repositorio();

    await expect(
      new UsuarioPasarelaTrazada(interno, registro()).buscarPorUsername('admin'),
    ).resolves.toBe(usuario);
  });

  it('delega con el mismo nombre de usuario', async () => {
    const interno = repositorio();

    await new UsuarioPasarelaTrazada(interno, registro()).buscarPorUsername('admin');

    expect(interno.buscarPorUsername).toHaveBeenCalledWith('admin');
  });

  it('mide la duracion de la busqueda', async () => {
    const r = registro();

    await new UsuarioPasarelaTrazada(repositorio(), r).buscarPorUsername('admin');

    expect(r.depurar).toHaveBeenCalledTimes(1);
    expect(r.depurar.mock.calls[0]?.[0]).toContain('buscarPorUsername(admin)');
  });

  /*
   * Cuando el usuario no existe se registra una linea adicional. Un pico de
   * estas lineas con nombres distintos es la firma de una enumeracion de
   * usuarios, y sin la traza no habria forma de verlo: la respuesta al cliente
   * es identica a la de una contrasena equivocada, precisamente para no filtrar
   * que usuarios existen.
   */
  it('deja constancia del intento contra un usuario inexistente', async () => {
    const r = registro();

    await new UsuarioPasarelaTrazada(repositorio(null), r).buscarPorUsername('fantasma');

    expect(r.depurar).toHaveBeenCalledTimes(2);
    expect(r.depurar.mock.calls.some(([m]) => m.includes('No existe'))).toBe(true);
  });

  it('no registra esa linea cuando el usuario si existe', async () => {
    const r = registro();

    await new UsuarioPasarelaTrazada(repositorio(), r).buscarPorUsername('admin');

    expect(r.depurar.mock.calls.some(([m]) => m.includes('No existe'))).toBe(false);
  });

  it('devuelve null igualmente cuando no existe', async () => {
    await expect(
      new UsuarioPasarelaTrazada(repositorio(null), registro()).buscarPorUsername('x'),
    ).resolves.toBeNull();
  });

  it('propaga el error de la base sin envolverlo', async () => {
    const fallo = new Error('conexion rechazada');
    const interno = {
      buscarPorUsername: jest.fn().mockRejectedValue(fallo),
    } as jest.Mocked<UsuarioRepositorio>;

    await expect(
      new UsuarioPasarelaTrazada(interno, registro()).buscarPorUsername('admin'),
    ).rejects.toBe(fallo);
  });
});
