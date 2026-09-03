import { ErrorNoEncontrado } from '@hce/compartido';

import { ObtenerPerfilPeticion, PerfilUsuarioRespuesta } from '../modelos/auth.modelos';
import { ObtenerPerfilPuerto } from '../puertos/entrada/auth.puertos';
import { UsuarioRepositorio } from '../puertos/salida/usuario.repositorio';

/**
 * CAPA 2 · APLICACION — Caso de uso: obtener el perfil de un usuario.
 *
 * Se resuelve contra el repositorio y no contra el contenido del token, para
 * que la desactivación de una cuenta surta efecto de inmediato aunque su JWT
 * siga dentro de la ventana de 30 minutos.
 */
export class ObtenerPerfilCasoUso implements ObtenerPerfilPuerto {
  constructor(private readonly repositorio: UsuarioRepositorio) {}

  async ejecutar(peticion: ObtenerPerfilPeticion): Promise<PerfilUsuarioRespuesta> {
    const usuario = await this.repositorio.buscarPorUsername(peticion.username);

    if (!usuario || !usuario.activo) {
      throw new ErrorNoEncontrado('Usuario', peticion.username);
    }
    return usuario.aPerfilPublico();
  }
}
