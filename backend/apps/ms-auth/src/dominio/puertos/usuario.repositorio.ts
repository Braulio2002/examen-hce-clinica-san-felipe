import { Usuario } from '../entidades/usuario.entidad';

/**
 * Puerto de salida (arquitectura hexagonal).
 *
 * El dominio declara QUE necesita ("dame el usuario con este username") y no
 * COMO se obtiene. La implementacion concreta contra SQL Server vive en la capa
 * de infraestructura y se inyecta por token, cumpliendo el principio de
 * inversion de dependencias: el caso de uso depende de esta abstraccion, no de
 * la base de datos.
 */
export interface UsuarioRepositorio {
  buscarPorUsername(username: string): Promise<Usuario | null>;
}

/** Token de inyeccion. Es necesario porque una interfaz de TypeScript no existe en runtime. */
export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');

/**
 * Puerto de salida para el hashing de contrasenas.
 *
 * Aisla el dominio de la libreria concreta (bcrypt hoy, argon2 manana) y
 * permite sustituirla en pruebas por una implementacion determinista.
 */
export interface ServicioHash {
  verificar(passwordPlano: string, hash: string): Promise<boolean>;
  generar(passwordPlano: string): Promise<string>;
}

export const SERVICIO_HASH = Symbol('SERVICIO_HASH');
