import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { MssqlModule, MssqlService } from '@hce/compartido';

import { AutenticacionFachada } from './aplicacion/auth.fachada';
import { IniciarSesionCasoUso } from './aplicacion/casos-uso/iniciar-sesion.caso-uso';
import { ObtenerPerfilCasoUso } from './aplicacion/casos-uso/obtener-perfil.caso-uso';
import {
  SERVICIO_HASH,
  USUARIO_REPOSITORIO,
} from './dominio/puertos/usuario.repositorio';
import { AuthControlador } from './infraestructura/controladores/auth.controlador';
import { UsuarioMssqlRepositorio } from './infraestructura/persistencia/usuario.mssql.repositorio';
import { UsuarioRepositorioTrazado } from './infraestructura/persistencia/usuario.repositorio-trazado';
import { BcryptServicio } from './infraestructura/seguridad/bcrypt.servicio';

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
    AutenticacionFachada,
    IniciarSesionCasoUso,
    ObtenerPerfilCasoUso,

    /*
     * Composicion explicita del patron Decorator.
     *
     * El caso de uso pide USUARIO_REPOSITORIO y recibe la cadena
     *     UsuarioRepositorioTrazado -> UsuarioMssqlRepositorio
     * sin saber que esta decorada. Agregar cache o reintentos es anadir un
     * envoltorio mas en esta factoria, sin tocar dominio ni aplicacion.
     */
    {
      provide: USUARIO_REPOSITORIO,
      inject: [MssqlService],
      useFactory: (mssql: MssqlService) =>
        new UsuarioRepositorioTrazado(new UsuarioMssqlRepositorio(mssql)),
    },
    {
      provide: SERVICIO_HASH,
      useClass: BcryptServicio,
    },
  ],
})
export class AuthModule {}
