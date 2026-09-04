import { medirTiempo, type RegistroPuerto } from '@hce/compartido';

import type { UsuarioRepositorio } from '../../aplicacion/puertos/salida/usuario.repositorio';
import type { Usuario } from '../../dominio/entidades/usuario.entidad';

/**
 * CAPA 3 · ADAPTADORES — PATRON DECORATOR.
 *
 * Envuelve cualquier implementación de UsuarioRepositorio y le añade
 * trazabilidad sin modificarla. Cumple los cuatro rasgos del patrón:
 *
 *   1. Implementa la MISMA interfaz que el objeto que envuelve.
 *   2. Recibe el componente envuelto por constructor.
 *   3. Delega en él y aporta comportamiento alrededor.
 *   4. Es apilable: puede envolverse a su vez con un decorador de caché o de
 *      reintentos sin que el caso de uso se entere.
 *
 * Por qué aquí y no un interceptor de NestJS: un interceptor observa el límite
 * HTTP o RPC, no el acceso a datos. Este decorador mide exactamente el tiempo
 * del puerto de persistencia, que es la métrica útil para detectar una consulta
 * lenta en la base clínica.
 *
 * Seguridad: se registra el username consultado, jamás el hash ni el usuario
 * completo.
 */
export class UsuarioPasarelaTrazada implements UsuarioRepositorio {
  constructor(
    private readonly interno: UsuarioRepositorio,
    private readonly registro: RegistroPuerto,
  ) {}

  async buscarPorUsername(username: string): Promise<Usuario | null> {
    return medirTiempo(this.registro, `buscarPorUsername(${username})`, async () => {
      const usuario = await this.interno.buscarPorUsername(username);
      if (!usuario) {
        this.registro.depurar(`No existe el usuario "${username}".`);
      }
      return usuario;
    });
  }
}
