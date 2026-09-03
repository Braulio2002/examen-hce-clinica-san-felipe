import { ErrorNoAutorizado, RegistroPuerto } from '@hce/compartido';

import { IniciarSesionPeticion, SesionRespuesta } from '../modelos/auth.modelos';
import { IniciarSesionPuerto } from '../puertos/entrada/auth.puertos';
import { ServicioHashPuerto } from '../puertos/salida/servicio-hash.puerto';
import { ServicioTokenPuerto } from '../puertos/salida/servicio-token.puerto';
import { UsuarioRepositorio } from '../puertos/salida/usuario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: iniciar sesión.
 *
 * Regla de negocio de aplicación: validar credenciales y emitir un token.
 *
 * Obsérvese lo que este archivo NO importa: ni `@nestjs/common`, ni
 * `@nestjs/jwt`, ni `bcryptjs`, ni `mssql`. Todas sus dependencias son puertos
 * declarados por la propia capa de aplicación y recibidos por constructor.
 *
 * Consecuencia práctica: la prueba unitaria de este caso de uso se escribe con
 * tres objetos literales y se ejecuta en milisegundos, sin contenedor de
 * inyección ni base de datos.
 */
export class IniciarSesionCasoUso implements IniciarSesionPuerto {
  /**
   * Hash bcrypt válido de una contraseña aleatoria que nadie conoce.
   *
   * Se compara contra él cuando el usuario NO existe, para consumir el mismo
   * tiempo de CPU que una verificación real. Sin esto, el tiempo de respuesta
   * revelaría qué usuarios están registrados (enumeración por temporización).
   */
  private static readonly HASH_SENUELO =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4rXWiTXHQ0kx6cVxOJ0aQCFnu2xC';

  constructor(
    private readonly repositorio: UsuarioRepositorio,
    private readonly hash: ServicioHashPuerto,
    private readonly token: ServicioTokenPuerto,
    private readonly registro: RegistroPuerto,
  ) {}

  async ejecutar(peticion: IniciarSesionPeticion): Promise<SesionRespuesta> {
    const usuario = await this.repositorio.buscarPorUsername(peticion.username);

    const hashComparacion = usuario?.obtenerHash() ?? IniciarSesionCasoUso.HASH_SENUELO;
    const passwordValido = await this.hash.verificar(peticion.password, hashComparacion);

    if (!usuario || !passwordValido || !usuario.activo) {
      this.registro.advertir(
        `Intento de acceso fallido para el usuario "${peticion.username}".`,
      );
      // Mensaje deliberadamente genérico: no distingue usuario inexistente de
      // contraseña incorrecta.
      throw new ErrorNoAutorizado('Usuario o contrasena incorrectos.');
    }

    const perfil = usuario.aPerfilPublico();

    const emitido = await this.token.emitir({
      idUsuario: perfil.id,
      username: perfil.username,
      nombreCompleto: perfil.nombreCompleto,
      rol: perfil.rol,
    });

    this.registro.informar(`Sesion iniciada por "${perfil.username}" (rol ${perfil.rol}).`);

    return {
      accessToken: emitido.token,
      expiraEnSegundos: emitido.expiraEnSegundos,
      usuario: perfil,
    };
  }
}
