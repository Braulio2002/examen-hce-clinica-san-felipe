import { SetMetadata } from '@nestjs/common';

export type Rol = 'ADMIN' | 'FARMACIA' | 'CONSULTA';

export const CLAVE_ROLES = 'roles_requeridos';

/**
 * Restringe un endpoint a los roles indicados.
 *
 * Ejemplo de decorador propio de Nest (distinto del patron Decorator de la GoF
 * que se aplica en los repositorios): aqui se decora metadata, no un objeto.
 * Ambos usos se explican en la documentacion de arquitectura.
 */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_ROLES, roles);
