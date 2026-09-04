import { CodigoError } from '@hce/compartido';

import { Usuario } from '../../dominio/entidades/usuario.entidad';
import { ObtenerPerfilCasoUso } from '../casos-uso/obtener-perfil.caso-uso';
import type {
  IniciarSesionPeticion,
  PerfilUsuarioRespuesta,
  SesionRespuesta,
} from '../modelos/auth.modelos';
import type {
  IniciarSesionPuerto,
  ObtenerPerfilPuerto,
} from '../puertos/entrada/auth.puertos';
import type { UsuarioRepositorio } from '../puertos/salida/usuario.repositorio';

import { AutenticacionFachada } from './autenticacion.fachada';

/**
 * Pruebas de la fachada de autenticacion y del caso de uso de perfil.
 *
 * La fachada no tiene reglas propias, y esa es justamente la propiedad que se
 * verifica: que delega sin transformar. Si algun dia alguien mete un `if` de
 * negocio aqui, estas pruebas dejaran de describir lo que hace el archivo.
 */
describe('AutenticacionFachada', () => {
  const PERFIL: PerfilUsuarioRespuesta = {
    id: 1,
    username: 'admin',
    nombreCompleto: 'Administrador',
    rol: 'ADMIN',
  };

  const SESION: SesionRespuesta = {
    accessToken: 'token',
    expiraEnSegundos: 1800,
    usuario: PERFIL,
  };

  it('delega el inicio de sesion sin alterar la peticion', async () => {
    const recibidas: IniciarSesionPeticion[] = [];
    const iniciarSesion: IniciarSesionPuerto = {
      ejecutar: (peticion) => {
        recibidas.push(peticion);
        return Promise.resolve(SESION);
      },
    };
    const obtenerPerfil: ObtenerPerfilPuerto = {
      ejecutar: () => Promise.resolve(PERFIL),
    };

    const fachada = new AutenticacionFachada(iniciarSesion, obtenerPerfil);
    const resultado = await fachada.autenticar({ username: 'admin', password: 'x' });

    expect(recibidas).toEqual([{ username: 'admin', password: 'x' }]);
    expect(resultado).toBe(SESION);
  });

  it('delega la consulta de perfil', async () => {
    const iniciarSesion: IniciarSesionPuerto = {
      ejecutar: () => Promise.resolve(SESION),
    };
    const obtenerPerfil: ObtenerPerfilPuerto = {
      ejecutar: () => Promise.resolve(PERFIL),
    };

    const fachada = new AutenticacionFachada(iniciarSesion, obtenerPerfil);

    await expect(fachada.perfil({ username: 'admin' })).resolves.toBe(PERFIL);
  });

  it('propaga el error del caso de uso sin envolverlo', async () => {
    const fallo = new Error('fallo del caso de uso');
    const iniciarSesion: IniciarSesionPuerto = { ejecutar: () => Promise.reject(fallo) };
    const obtenerPerfil: ObtenerPerfilPuerto = {
      ejecutar: () => Promise.resolve(PERFIL),
    };

    const fachada = new AutenticacionFachada(iniciarSesion, obtenerPerfil);

    await expect(fachada.autenticar({ username: 'x', password: 'y' })).rejects.toBe(
      fallo,
    );
  });
});

describe('ObtenerPerfilCasoUso', () => {
  function repositorioCon(usuario: Usuario | null): UsuarioRepositorio {
    return { buscarPorUsername: () => Promise.resolve(usuario) };
  }

  it('devuelve el perfil publico de un usuario activo', async () => {
    const usuario = new Usuario(
      1,
      'admin',
      'Administrador',
      'ADMIN',
      true,
      '$2b$10$hash',
    );
    const caso = new ObtenerPerfilCasoUso(repositorioCon(usuario));

    const perfil = await caso.ejecutar({ username: 'admin' });

    expect(perfil).toEqual({
      id: 1,
      username: 'admin',
      nombreCompleto: 'Administrador',
      rol: 'ADMIN',
    });
  });

  it('nunca expone el hash de la contrasena', async () => {
    const usuario = new Usuario(
      1,
      'admin',
      'Administrador',
      'ADMIN',
      true,
      '$2b$10$secreto',
    );
    const caso = new ObtenerPerfilCasoUso(repositorioCon(usuario));

    const perfil = await caso.ejecutar({ username: 'admin' });

    expect(JSON.stringify(perfil)).not.toContain('$2b$');
  });

  it('lanza NO_ENCONTRADO si el usuario no existe', async () => {
    const caso = new ObtenerPerfilCasoUso(repositorioCon(null));

    await expect(caso.ejecutar({ username: 'fantasma' })).rejects.toMatchObject({
      codigo: CodigoError.NO_ENCONTRADO,
    });
  });

  it('lanza NO_ENCONTRADO si el usuario esta desactivado', async () => {
    /*
     * Es lo que hace efectiva la desactivacion inmediata: aunque el JWT del
     * usuario siga dentro de su ventana de 30 minutos, la consulta de perfil
     * va contra la base y detecta que la cuenta ya no esta activa.
     */
    const usuario = new Usuario(
      1,
      'baja',
      'Dado de baja',
      'FARMACIA',
      false,
      '$2b$10$hash',
    );
    const caso = new ObtenerPerfilCasoUso(repositorioCon(usuario));

    await expect(caso.ejecutar({ username: 'baja' })).rejects.toMatchObject({
      codigo: CodigoError.NO_ENCONTRADO,
    });
  });
});

describe('Entidad Usuario', () => {
  it('ADMIN y FARMACIA pueden operar el inventario', () => {
    const admin = new Usuario(1, 'a', 'A', 'ADMIN', true, 'h');
    const farmacia = new Usuario(2, 'f', 'F', 'FARMACIA', true, 'h');

    expect(admin.puedeOperarInventario()).toBe(true);
    expect(farmacia.puedeOperarInventario()).toBe(true);
  });

  it('CONSULTA no puede operar el inventario', () => {
    const consulta = new Usuario(3, 'c', 'C', 'CONSULTA', true, 'h');

    expect(consulta.puedeOperarInventario()).toBe(false);
  });

  it('un usuario desactivado no puede operar aunque su rol lo permita', () => {
    const inactivo = new Usuario(4, 'a', 'A', 'ADMIN', false, 'h');

    expect(inactivo.puedeOperarInventario()).toBe(false);
  });
});
