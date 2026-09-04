import { CodigoError, ExcepcionDominio, type RegistroPuerto } from '@hce/compartido';

import { Usuario } from '../../dominio/entidades/usuario.entidad';
import type { ServicioHashPuerto } from '../puertos/salida/servicio-hash.puerto';
import type { ServicioTokenPuerto } from '../puertos/salida/servicio-token.puerto';
import type { UsuarioRepositorio } from '../puertos/salida/usuario.repositorio';

import { IniciarSesionCasoUso } from './iniciar-sesion.caso-uso';

/**
 * Pruebas del caso de uso de inicio de sesion.
 *
 * Se construye con cuatro dobles literales y ninguna infraestructura: sin
 * NestJS, sin base de datos, sin bcrypt real. Eso es exactamente lo que la
 * arquitectura promete, y esta prueba es la que lo demuestra: si algun dia
 * alguien introduce una dependencia de framework en el caso de uso, este
 * archivo dejara de compilar.
 */
describe('IniciarSesionCasoUso', () => {
  const HASH_ALMACENADO = '$2b$10$hash.de.prueba';

  function crearUsuario(activo = true): Usuario {
    return new Usuario(1, 'admin', 'Administrador', 'ADMIN', activo, HASH_ALMACENADO);
  }

  function crearRegistro(): RegistroPuerto & {
    advertencias: string[];
    informaciones: string[];
  } {
    const advertencias: string[] = [];
    const informaciones: string[] = [];
    return {
      advertencias,
      informaciones,
      depurar: () => undefined,
      informar: (m) => informaciones.push(m),
      advertir: (m) => advertencias.push(m),
      error: () => undefined,
    };
  }

  function crearCaso(opciones: {
    usuario?: Usuario | null;
    passwordValido?: boolean;
    registro?: RegistroPuerto;
  }) {
    const repositorio: UsuarioRepositorio = {
      buscarPorUsername: () => Promise.resolve(opciones.usuario ?? null),
    };
    const hash: ServicioHashPuerto = {
      verificar: () => Promise.resolve(opciones.passwordValido ?? true),
      generar: () => Promise.resolve('irrelevante'),
    };
    const token: ServicioTokenPuerto = {
      emitir: (contenido) =>
        Promise.resolve({
          token: `token-de-${contenido.username}`,
          expiraEnSegundos: 1800,
        }),
    };
    const registro = opciones.registro ?? crearRegistro();

    return new IniciarSesionCasoUso(repositorio, hash, token, registro);
  }

  describe('credenciales correctas', () => {
    it('emite un token para el usuario autenticado', async () => {
      // Arrange
      const caso = crearCaso({ usuario: crearUsuario(), passwordValido: true });

      // Act
      const sesion = await caso.ejecutar({ username: 'admin', password: 'correcta' });

      // Assert
      expect(sesion.accessToken).toBe('token-de-admin');
      expect(sesion.usuario.username).toBe('admin');
      expect(sesion.usuario.rol).toBe('ADMIN');
    });

    it('el token expira a los 30 minutos, como exige el enunciado', async () => {
      const caso = crearCaso({ usuario: crearUsuario(), passwordValido: true });

      const sesion = await caso.ejecutar({ username: 'admin', password: 'correcta' });

      expect(sesion.expiraEnSegundos).toBe(1800);
    });

    it('nunca devuelve el hash de la contrasena', async () => {
      const caso = crearCaso({ usuario: crearUsuario(), passwordValido: true });

      const sesion = await caso.ejecutar({ username: 'admin', password: 'correcta' });

      expect(JSON.stringify(sesion)).not.toContain(HASH_ALMACENADO);
      expect(JSON.stringify(sesion)).not.toContain('$2b$');
    });
  });

  describe('credenciales incorrectas', () => {
    it('rechaza una contrasena que no coincide', async () => {
      const caso = crearCaso({ usuario: crearUsuario(), passwordValido: false });

      await expect(
        caso.ejecutar({ username: 'admin', password: 'mala' }),
      ).rejects.toThrow(ExcepcionDominio);
    });

    it('rechaza un usuario inexistente', async () => {
      const caso = crearCaso({ usuario: null });

      await expect(
        caso.ejecutar({ username: 'fantasma', password: 'x' }),
      ).rejects.toThrow(ExcepcionDominio);
    });

    it('rechaza un usuario desactivado aunque la contrasena sea correcta', async () => {
      const caso = crearCaso({ usuario: crearUsuario(false), passwordValido: true });

      await expect(
        caso.ejecutar({ username: 'admin', password: 'correcta' }),
      ).rejects.toThrow(ExcepcionDominio);
    });

    it('devuelve el codigo NO_AUTORIZADO', async () => {
      const caso = crearCaso({ usuario: null });

      await expect(caso.ejecutar({ username: 'x', password: 'y' })).rejects.toMatchObject(
        {
          codigo: CodigoError.NO_AUTORIZADO,
        },
      );
    });

    it('usa el mismo mensaje para usuario inexistente y contrasena incorrecta', async () => {
      // Un mensaje distinto permitiria enumerar que usuarios existen.
      const sinUsuario = crearCaso({ usuario: null });
      const conPasswordMala = crearCaso({
        usuario: crearUsuario(),
        passwordValido: false,
      });

      const mensajes: string[] = [];
      for (const caso of [sinUsuario, conPasswordMala]) {
        await caso
          .ejecutar({ username: 'admin', password: 'x' })
          .catch((error: unknown) => {
            mensajes.push(error instanceof Error ? error.message : String(error));
          });
      }

      expect(mensajes).toHaveLength(2);
      expect(mensajes[0]).toBe(mensajes[1]);
    });
  });

  describe('defensa contra enumeracion por temporizacion', () => {
    it('verifica un hash senuelo aunque el usuario no exista', async () => {
      /*
       * Si el caso de uso saliera antes de llamar a `verificar` cuando el
       * usuario no existe, el tiempo de respuesta revelaria que usuarios estan
       * registrados. Se comprueba que la verificacion se invoca igualmente y
       * que recibe un hash con forma de bcrypt.
       */
      const hashesComparados: string[] = [];
      const repositorio: UsuarioRepositorio = {
        buscarPorUsername: () => Promise.resolve(null),
      };
      const hash: ServicioHashPuerto = {
        verificar: (_plano, hashRecibido) => {
          hashesComparados.push(hashRecibido);
          return Promise.resolve(false);
        },
        generar: () => Promise.resolve(''),
      };
      const token: ServicioTokenPuerto = {
        emitir: () => Promise.resolve({ token: '', expiraEnSegundos: 0 }),
      };

      const caso = new IniciarSesionCasoUso(repositorio, hash, token, crearRegistro());

      await caso
        .ejecutar({ username: 'inexistente', password: 'x' })
        .catch(() => undefined);

      expect(hashesComparados).toHaveLength(1);
      expect(hashesComparados[0]).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('trazabilidad', () => {
    it('registra el intento fallido con el nombre de usuario', async () => {
      const registro = crearRegistro();
      const caso = crearCaso({ usuario: null, registro });

      await caso
        .ejecutar({ username: 'sospechoso', password: 'x' })
        .catch(() => undefined);

      expect(registro.advertencias.join(' ')).toContain('sospechoso');
    });

    it('no escribe la contrasena en el registro', async () => {
      const registro = crearRegistro();
      const caso = crearCaso({ usuario: null, registro });

      await caso
        .ejecutar({ username: 'admin', password: 'SuperSecreta123' })
        .catch(() => undefined);

      expect(
        [...registro.advertencias, ...registro.informaciones].join(' '),
      ).not.toContain('SuperSecreta123');
    });
  });
});
