import { Inject, Injectable } from '@nestjs/common';

import { ErrorNoEncontrado } from '@hce/compartido';

import { PerfilUsuario } from '../../dominio/entidades/usuario.entidad';
import {
  USUARIO_REPOSITORIO,
  UsuarioRepositorio,
} from '../../dominio/puertos/usuario.repositorio';

/**
 * Caso de uso: obtener el perfil publico de un usuario ya autenticado.
 *
 * Se resuelve contra la base y no contra el contenido del token, para que la
 * desactivacion de una cuenta tenga efecto inmediato aunque el JWT emitido siga
 * dentro de su ventana de 30 minutos.
 */
@Injectable()
export class ObtenerPerfilCasoUso {
  constructor(@Inject(USUARIO_REPOSITORIO) private readonly repositorio: UsuarioRepositorio) {}

  async ejecutar(username: string): Promise<PerfilUsuario> {
    const usuario = await this.repositorio.buscarPorUsername(username);

    if (!usuario || !usuario.activo) {
      throw new ErrorNoEncontrado('Usuario', username);
    }
    return usuario.aPerfilPublico();
  }
}
