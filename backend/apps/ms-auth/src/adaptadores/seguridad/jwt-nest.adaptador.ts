import type { JwtService } from '@nestjs/jwt';

import type {
  ContenidoToken,
  ServicioTokenPuerto,
  TokenEmitido,
} from '../../aplicacion/puertos/salida/servicio-token.puerto';

/**
 * CAPA 3 · ADAPTADORES — Emisión de tokens con @nestjs/jwt.
 *
 * Traduce el contenido que expresa la aplicación (identificador, username, rol)
 * al formato de reclamaciones estándar de un JWT: `sub`, `username`, `rol`.
 *
 * La vigencia llega por constructor. El enunciado exige 30 minutos exactos, y
 * ese número vive en la configuración, no incrustado aquí.
 */
export class JwtNestAdaptador implements ServicioTokenPuerto {
  constructor(
    private readonly jwt: JwtService,
    private readonly expiraEnSegundos: number,
  ) {}

  async emitir(contenido: ContenidoToken): Promise<TokenEmitido> {
    const token = await this.jwt.signAsync(
      {
        sub: contenido.idUsuario,
        username: contenido.username,
        nombre: contenido.nombreCompleto,
        rol: contenido.rol,
      },
      { expiresIn: this.expiraEnSegundos },
    );

    return { token, expiraEnSegundos: this.expiraEnSegundos };
  }
}
