import { Usuario } from '../../../dominio/entidades/usuario.entidad';

/**
 * CAPA 2 · APLICACION — Puerto de salida (Output Boundary).
 *
 * El caso de uso declara QUE necesita ("dame el usuario con este username") sin
 * saber COMO se obtiene. La implementación concreta contra SQL Server vive en
 * la capa de adaptadores y se inyecta por token.
 *
 * Ésta es la inversión de dependencias de Clean Architecture: la flecha de
 * código apunta hacia adentro (el adaptador conoce esta interfaz), mientras que
 * la flecha de control apunta hacia afuera (el caso de uso invoca al adaptador).
 */
export interface UsuarioRepositorio {
  buscarPorUsername(username: string): Promise<Usuario | null>;
}

export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');
