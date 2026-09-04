import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';

import { MssqlModule, MssqlService, RegistroNest } from '@hce/compartido';

import {
  AUTENTICACION_FACHADA,
  AuthControlador,
} from '../../adaptadores/controladores/auth.controlador';
import { UsuarioMssqlPasarela } from '../../adaptadores/pasarelas/usuario.mssql.pasarela';
import { UsuarioPasarelaTrazada } from '../../adaptadores/pasarelas/usuario.pasarela-trazada';
import { BcryptAdaptador } from '../../adaptadores/seguridad/bcrypt.adaptador';
import { JwtNestAdaptador } from '../../adaptadores/seguridad/jwt-nest.adaptador';
import { IniciarSesionCasoUso } from '../../aplicacion/casos-uso/iniciar-sesion.caso-uso';
import { ObtenerPerfilCasoUso } from '../../aplicacion/casos-uso/obtener-perfil.caso-uso';
import { AutenticacionFachada } from '../../aplicacion/fachadas/autenticacion.fachada';
import {
  INICIAR_SESION_PUERTO,
  IniciarSesionPuerto,
  OBTENER_PERFIL_PUERTO,
  ObtenerPerfilPuerto,
} from '../../aplicacion/puertos/entrada/auth.puertos';
import {
  SERVICIO_HASH,
  ServicioHashPuerto,
} from '../../aplicacion/puertos/salida/servicio-hash.puerto';
import {
  SERVICIO_TOKEN,
  ServicioTokenPuerto,
} from '../../aplicacion/puertos/salida/servicio-token.puerto';
import {
  USUARIO_REPOSITORIO,
  UsuarioRepositorio,
} from '../../aplicacion/puertos/salida/usuario.repositorio';

/**
 * CAPA 4 · INFRAESTRUCTURA — Raíz de composición (Composition Root).
 *
 * Éste es el único archivo del microservicio donde se decide QUE implementación
 * concreta satisface cada puerto. Ni el dominio ni la aplicación conocen
 * NestJS: por eso todo se declara con `useFactory` en lugar de `@Injectable()`
 * sobre los casos de uso.
 *
 * La verbosidad es deliberada y tiene una contrapartida concreta: al leer este
 * archivo se ve el grafo de dependencias completo del servicio, incluida la
 * composición de decoradores, sin tener que abrir ninguna otra clase.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MssqlModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          issuer: config.get<string>('JWT_ISSUER', 'hce-clinica-san-felipe'),
          audience: config.get<string>('JWT_AUDIENCE', 'hce-frontend'),
          algorithm: 'HS256',
        },
      }),
    }),
  ],
  controllers: [AuthControlador],
  providers: [
    /* --- Puertos de salida: adaptadores concretos -------------------------- */

    /*
     * Composición explícita del patrón Decorator:
     *     UsuarioPasarelaTrazada  ->  UsuarioMssqlPasarela
     * El caso de uso pide USUARIO_REPOSITORIO y recibe la cadena completa sin
     * saber que está decorada. Añadir caché o reintentos es agregar un
     * envoltorio más aquí, sin tocar dominio ni aplicación.
     */
    {
      provide: USUARIO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService): UsuarioRepositorio =>
        new UsuarioPasarelaTrazada(
          new UsuarioMssqlPasarela(mssql),
          new RegistroNest('UsuarioPasarela'),
        ),
    },
    {
      provide: SERVICIO_HASH,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ServicioHashPuerto =>
        new BcryptAdaptador(Number(config.get<string>('BCRYPT_RONDAS', '10'))),
    },
    {
      provide: SERVICIO_TOKEN,
      inject: [JwtService, ConfigService],
      useFactory: (jwt: JwtService, config: ConfigService): ServicioTokenPuerto =>
        // Vigencia estricta de 30 minutos exigida por el enunciado.
        new JwtNestAdaptador(
          jwt,
          Number(config.get<string>('JWT_EXPIRACION_SEGUNDOS', '1800')),
        ),
    },

    /* --- Puertos de entrada: casos de uso ---------------------------------- */
    {
      provide: INICIAR_SESION_PUERTO,
      inject: [USUARIO_REPOSITORIO, SERVICIO_HASH, SERVICIO_TOKEN],
      useFactory: (
        repositorio: UsuarioRepositorio,
        hash: ServicioHashPuerto,
        token: ServicioTokenPuerto,
      ): IniciarSesionPuerto =>
        new IniciarSesionCasoUso(
          repositorio,
          hash,
          token,
          new RegistroNest('IniciarSesion'),
        ),
    },
    {
      provide: OBTENER_PERFIL_PUERTO,
      inject: [USUARIO_REPOSITORIO],
      useFactory: (repositorio: UsuarioRepositorio): ObtenerPerfilPuerto =>
        new ObtenerPerfilCasoUso(repositorio),
    },

    /* --- Fachada (patrón Facade) ------------------------------------------- */
    {
      provide: AUTENTICACION_FACHADA,
      inject: [INICIAR_SESION_PUERTO, OBTENER_PERFIL_PUERTO],
      useFactory: (
        iniciarSesion: IniciarSesionPuerto,
        obtenerPerfil: ObtenerPerfilPuerto,
      ): AutenticacionFachada => new AutenticacionFachada(iniciarSesion, obtenerPerfil),
    },
  ],
})
export class AuthModule {}
