import { Test, type TestingModule } from '@nestjs/testing';

import { MssqlService } from '@hce/compartido';

import {
  AUTENTICACION_FACHADA,
  AuthControlador,
} from '../../adaptadores/controladores/auth.controlador';
import { UsuarioPasarelaTrazada } from '../../adaptadores/pasarelas/usuario.pasarela-trazada';
import { BcryptAdaptador } from '../../adaptadores/seguridad/bcrypt.adaptador';
import { JwtNestAdaptador } from '../../adaptadores/seguridad/jwt-nest.adaptador';
import { AutenticacionFachada } from '../../aplicacion/fachadas/autenticacion.fachada';
import {
  INICIAR_SESION_PUERTO,
  OBTENER_PERFIL_PUERTO,
} from '../../aplicacion/puertos/entrada/auth.puertos';
import { SERVICIO_HASH } from '../../aplicacion/puertos/salida/servicio-hash.puerto';
import { SERVICIO_TOKEN } from '../../aplicacion/puertos/salida/servicio-token.puerto';
import { USUARIO_REPOSITORIO } from '../../aplicacion/puertos/salida/usuario.repositorio';

import { AuthModule } from './auth.module';

/**
 * Pruebas de la raiz de composicion del microservicio de Autenticacion.
 *
 * Es el modulo con mas puertos de salida de los cuatro: repositorio, hash y
 * token. Los tres son intercambiables por diseno -bcrypt podria ser argon2, y
 * el JWT propio podria ser un proveedor externo- y por eso se resuelven por
 * Symbol y no por clase.
 *
 * Aqui esa indireccion se paga con cableado manual, y el cableado manual es lo
 * que esta prueba verifica: que cada puerto quede satisfecho por la
 * implementacion prevista y que el caso de uso de login reciba las tres en la
 * posicion correcta.
 */
describe('AuthModule (raiz de composicion)', () => {
  let modulo: TestingModule;

  beforeAll(async () => {
    // El modulo lee el secreto del entorno al construir el JwtModule.
    process.env.JWT_SECRET ??= 'secreto-de-prueba-suficientemente-largo';

    modulo = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(MssqlService)
      .useValue({ consultar: jest.fn(), ejecutarProcedimiento: jest.fn() })
      .compile();
  });

  afterAll(async () => {
    await modulo.close();
  });

  it('el modulo se construye entero sin dependencias sin resolver', () => {
    expect(modulo).toBeDefined();
  });

  it('registra el controlador RPC', () => {
    expect(modulo.get(AuthControlador)).toBeInstanceOf(AuthControlador);
  });

  describe('puertos de salida', () => {
    it('el repositorio de usuarios llega decorado con trazas', () => {
      expect(modulo.get(USUARIO_REPOSITORIO)).toBeInstanceOf(UsuarioPasarelaTrazada);
    });

    it('el puerto de hash lo satisface bcrypt', () => {
      expect(modulo.get(SERVICIO_HASH)).toBeInstanceOf(BcryptAdaptador);
    });

    it('el puerto de token lo satisface el adaptador de JWT', () => {
      expect(modulo.get(SERVICIO_TOKEN)).toBeInstanceOf(JwtNestAdaptador);
    });

    /*
     * El coste de bcrypt sale de la configuracion. Es lo que permite subirlo en
     * produccion segun aguante el servidor sin tocar una linea de codigo, y es
     * un parametro de seguridad: mas rondas, mas caro le sale a un atacante
     * probar contrasenas contra un volcado de la base.
     */
    it('el coste de bcrypt sale del entorno y llega como numero', () => {
      const adaptador = modulo.get<BcryptAdaptador>(SERVICIO_HASH);
      const rondas = (adaptador as unknown as { rondas: unknown }).rondas;

      expect(typeof rondas).toBe('number');
      expect(rondas).toBeGreaterThanOrEqual(10);
    });
  });

  describe('casos de uso', () => {
    it.each([
      ['iniciar sesion', INICIAR_SESION_PUERTO],
      ['obtener perfil', OBTENER_PERFIL_PUERTO],
    ])('el puerto de %s esta satisfecho y es ejecutable', (_caso, token) => {
      expect(typeof modulo.get<{ ejecutar: unknown }>(token).ejecutar).toBe('function');
    });

    /*
     * El caso de uso de login recibe tres colaboradores de tipos distintos. Un
     * `inject` desordenado los cruzaria y el compilador no diria nada, porque
     * las fabricas devuelven el tipo declarado en la firma, no el que realmente
     * se construyo. Comprobar la identidad de cada uno es lo unico que lo
     * detecta antes del arranque.
     */
    it('el login recibe repositorio, hash y token en su sitio', () => {
      const casoUso = modulo.get<Record<string, unknown>>(INICIAR_SESION_PUERTO);

      expect(casoUso.repositorio).toBe(modulo.get(USUARIO_REPOSITORIO));
      expect(casoUso.hash).toBe(modulo.get(SERVICIO_HASH));
      expect(casoUso.token).toBe(modulo.get(SERVICIO_TOKEN));
    });
  });

  describe('fachada', () => {
    it('se construye', () => {
      expect(modulo.get(AUTENTICACION_FACHADA)).toBeInstanceOf(AutenticacionFachada);
    });

    it('recibe los dos casos de uso sin cruzarlos', () => {
      const fachada = modulo.get<AutenticacionFachada>(AUTENTICACION_FACHADA);
      const interno = fachada as unknown as Record<string, unknown>;

      expect(interno.iniciarSesion).toBe(modulo.get(INICIAR_SESION_PUERTO));
      expect(interno.obtenerPerfil).toBe(modulo.get(OBTENER_PERFIL_PUERTO));
    });
  });
});
