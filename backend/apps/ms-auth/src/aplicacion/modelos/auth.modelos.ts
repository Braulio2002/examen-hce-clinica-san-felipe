import { RolUsuario } from '../../dominio/entidades/usuario.entidad';

/**
 * CAPA 2 · APLICACION — Modelos de petición y respuesta.
 *
 * Son las estructuras que cruzan las fronteras del caso de uso. Deliberadamente
 * planas: sin decoradores, sin métodos, sin dependencias del framework.
 *
 * No son entidades. `PerfilUsuarioRespuesta` se parece a `Usuario`, pero es
 * otra cosa: la entidad tiene el hash de la contraseña y reglas de negocio; el
 * modelo de respuesta solo tiene lo que el exterior puede ver. Confundirlos es
 * el camino más corto a filtrar un hash en una respuesta HTTP.
 */

export interface IniciarSesionPeticion {
  readonly username: string;
  readonly password: string;
}

export interface PerfilUsuarioRespuesta {
  readonly id: number;
  readonly username: string;
  readonly nombreCompleto: string;
  readonly rol: RolUsuario;
}

export interface SesionRespuesta {
  readonly accessToken: string;
  /** Vigencia en segundos. El enunciado exige 30 minutos = 1800 s. */
  readonly expiraEnSegundos: number;
  readonly usuario: PerfilUsuarioRespuesta;
}

export interface ObtenerPerfilPeticion {
  readonly username: string;
}
