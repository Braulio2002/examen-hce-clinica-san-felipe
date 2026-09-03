import { Injectable, Logger } from '@nestjs/common';

import { medirTiempo } from '@hce/compartido';

import { Usuario } from '../../dominio/entidades/usuario.entidad';
import { UsuarioRepositorio } from '../../dominio/puertos/usuario.repositorio';

/**
 * PATRON DECORATOR
 * ================
 * Envuelve cualquier implementacion de UsuarioRepositorio y le agrega
 * trazabilidad sin modificarla.
 *
 * Cumple los cuatro rasgos del patron:
 *   1. Implementa la MISMA interfaz que el objeto que envuelve.
 *   2. Recibe el componente envuelto por constructor.
 *   3. Delega en el y aporta comportamiento adicional alrededor.
 *   4. Es apilable: se puede envolver a su vez con un decorador de cache o de
 *      reintentos sin que el caso de uso se entere.
 *
 * Por que aqui y no un interceptor de Nest: un interceptor observa el limite
 * HTTP/RPC, no el acceso a datos. Este decorador mide exactamente el tiempo del
 * puerto de persistencia, que es la metrica que interesa para detectar una
 * consulta lenta en la base clinica.
 *
 * Nota de seguridad: se registra el username consultado pero jamas el hash ni
 * el resultado completo del usuario.
 */
@Injectable()
export class UsuarioRepositorioTrazado implements UsuarioRepositorio {
  private readonly logger = new Logger(UsuarioRepositorioTrazado.name);

  constructor(private readonly interno: UsuarioRepositorio) {}

  async buscarPorUsername(username: string): Promise<Usuario | null> {
    return medirTiempo(this.logger, `buscarPorUsername(${username})`, async () => {
      const usuario = await this.interno.buscarPorUsername(username);
      if (!usuario) {
        this.logger.debug(`No existe el usuario "${username}".`);
      }
      return usuario;
    });
  }
}
