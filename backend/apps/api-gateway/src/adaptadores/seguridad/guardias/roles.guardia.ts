import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CLAVE_ROLES, Rol } from '../decoradores/roles.decorador';
import { UsuarioAutenticado } from '../estrategias/jwt.estrategia';

/**
 * Autorizacion por rol.
 *
 * Se ejecuta despues del guard JWT, por lo que puede asumir que request.user
 * existe cuando la ruta no es publica. Si un endpoint no declara @Roles(), no
 * impone restriccion adicional mas alla de estar autenticado.
 */
@Injectable()
export class RolesGuardia implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    // El generico incluye `undefined` porque un endpoint sin @Roles() no tiene
    // esa metadata: declararlo como `Rol[]` a secas hace creer al compilador
    // que siempre existe y convierte la comprobacion siguiente en codigo muerto.
    const rolesRequeridos = this.reflector.getAllAndOverride<Rol[] | undefined>(
      CLAVE_ROLES,
      [contexto.getHandler(), contexto.getClass()],
    );

    if (!rolesRequeridos?.length) return true;

    const { user } = contexto.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();

    if (!user || !rolesRequeridos.includes(user.rol)) {
      throw new ForbiddenException(
        `Esta operacion requiere uno de los siguientes roles: ${rolesRequeridos.join(', ')}.`,
      );
    }
    return true;
  }
}
