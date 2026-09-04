import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { UsuarioAutenticado } from '../estrategias/jwt.estrategia';

/**
 * Inyecta el usuario autenticado en el parametro del controlador.
 *
 * Evita que cada controlador repita `request.user as UsuarioAutenticado`, y
 * mantiene el tipado en un solo lugar.
 */
export const UsuarioActual = createParamDecorator(
  (campo: keyof UsuarioAutenticado | undefined, contexto: ExecutionContext) => {
    const peticion = contexto.switchToHttp().getRequest<{ user?: UsuarioAutenticado }>();
    const usuario = peticion.user;
    return campo && usuario ? usuario[campo] : usuario;
  },
);
