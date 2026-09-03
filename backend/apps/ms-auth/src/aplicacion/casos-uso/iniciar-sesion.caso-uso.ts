import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ErrorNoAutorizado } from '@hce/compartido';

import { PerfilUsuario } from '../../dominio/entidades/usuario.entidad';
import {
  SERVICIO_HASH,
  ServicioHash,
  USUARIO_REPOSITORIO,
  UsuarioRepositorio,
} from '../../dominio/puertos/usuario.repositorio';

export interface Credenciales {
  readonly username: string;
  readonly password: string;
}

export interface ResultadoSesion {
  readonly accessToken: string;
  /** Vigencia del token en segundos. El enunciado exige 30 minutos = 1800 s. */
  readonly expiraEnSegundos: number;
  readonly usuario: PerfilUsuario;
}

/**
 * Caso de uso: iniciar sesion.
 *
 * Responsabilidad unica (SRP): validar credenciales y emitir el token. No sabe
 * de HTTP, de cookies ni de TCP; el transporte lo resuelven las capas externas.
 */
@Injectable()
export class IniciarSesionCasoUso {
  private readonly logger = new Logger(IniciarSesionCasoUso.name);

  constructor(
    @Inject(USUARIO_REPOSITORIO) private readonly repositorio: UsuarioRepositorio,
    @Inject(SERVICIO_HASH) private readonly hash: ServicioHash,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async ejecutar(credenciales: Credenciales): Promise<ResultadoSesion> {
    const usuario = await this.repositorio.buscarPorUsername(credenciales.username);

    /*
     * Se verifica el hash incluso cuando el usuario no existe, contra un hash
     * ficticio de coste equivalente. Sin esto, el tiempo de respuesta revela si
     * un username esta registrado (ataque de enumeracion por temporizacion).
     */
    const hashComparacion = usuario?.obtenerHash() ?? HASH_SENUELO;
    const passwordValido = await this.hash.verificar(credenciales.password, hashComparacion);

    if (!usuario || !passwordValido || !usuario.activo) {
      this.logger.warn(`Intento de acceso fallido para el usuario "${credenciales.username}".`);
      // Mensaje deliberadamente generico: no distingue usuario inexistente de
      // contrasena incorrecta.
      throw new ErrorNoAutorizado('Usuario o contrasena incorrectos.');
    }

    const expiraEnSegundos = Number(this.config.get<string>('JWT_EXPIRACION_SEGUNDOS', '1800'));
    const perfil = usuario.aPerfilPublico();

    const accessToken = await this.jwt.signAsync(
      {
        sub: perfil.id,
        username: perfil.username,
        nombre: perfil.nombreCompleto,
        rol: perfil.rol,
      },
      { expiresIn: expiraEnSegundos },
    );

    this.logger.log(`Sesion iniciada por "${perfil.username}" (rol ${perfil.rol}).`);

    return { accessToken, expiraEnSegundos, usuario: perfil };
  }
}

/**
 * Hash bcrypt valido de una contrasena aleatoria que nadie conoce. Solo se usa
 * para consumir el mismo tiempo de CPU cuando el usuario no existe.
 */
const HASH_SENUELO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4rXWiTXHQ0kx6cVxOJ0aQCFnu2xC';
