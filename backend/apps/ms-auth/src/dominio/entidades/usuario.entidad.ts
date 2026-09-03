/**
 * Entidad de dominio Usuario.
 *
 * Capa mas interna de la arquitectura hexagonal: no importa nada de Nest, del
 * driver de base de datos ni de la libreria de hashing. Por eso puede probarse
 * de forma unitaria sin ningun contenedor de inyeccion.
 */

export type RolUsuario = 'ADMIN' | 'FARMACIA' | 'CONSULTA';

export const ROLES: readonly RolUsuario[] = ['ADMIN', 'FARMACIA', 'CONSULTA'] as const;

/** Permisos derivados del rol. La regla vive en el dominio, no en el guard. */
const PERMISOS_ESCRITURA: readonly RolUsuario[] = ['ADMIN', 'FARMACIA'];

export class Usuario {
  constructor(
    readonly id: number,
    readonly username: string,
    readonly nombreCompleto: string,
    readonly rol: RolUsuario,
    readonly activo: boolean,
    /** Hash bcrypt. Nunca sale de la capa de dominio hacia la respuesta. */
    private readonly passwordHash: string,
  ) {}

  /** Expone el hash unicamente al servicio que sabe verificarlo. */
  obtenerHash(): string {
    return this.passwordHash;
  }

  puedeOperarInventario(): boolean {
    return this.activo && PERMISOS_ESCRITURA.includes(this.rol);
  }

  /** Proyeccion segura: lo unico que se devuelve al exterior del sistema. */
  aPerfilPublico(): PerfilUsuario {
    return {
      id: this.id,
      username: this.username,
      nombreCompleto: this.nombreCompleto,
      rol: this.rol,
    };
  }
}

export interface PerfilUsuario {
  readonly id: number;
  readonly username: string;
  readonly nombreCompleto: string;
  readonly rol: RolUsuario;
}
