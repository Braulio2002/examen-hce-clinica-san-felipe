import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { CLAVE_PUBLICO } from '../decoradores/publico.decorador';

/**
 * Guard JWT global.
 *
 * Se registra como APP_GUARD, de modo que la postura por defecto de la API es
 * "denegar salvo que se declare publico". Solo /auth/login y /salud llevan el
 * decorador @Publico().
 */
@Injectable()
export class JwtAuthGuardia extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    contexto: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (esPublico) return true;
    return super.canActivate(contexto);
  }

  handleRequest<TUsuario>(error: unknown, usuario: TUsuario, info: unknown): TUsuario {
    if (error || !usuario) {
      /*
       * Se distingue el token vencido del token invalido porque el FrontEnd
       * necesita saber cuando redirigir al login por expiracion de los 30
       * minutos. No se filtra nada mas del contenido del token.
       */
      const nombreError = (info as Error | undefined)?.name;
      const mensaje =
        nombreError === 'TokenExpiredError'
          ? 'La sesion expiro. Vuelva a iniciar sesion.'
          : 'Token de acceso ausente o invalido.';

      throw new UnauthorizedException(mensaje);
    }
    return usuario;
  }
}
