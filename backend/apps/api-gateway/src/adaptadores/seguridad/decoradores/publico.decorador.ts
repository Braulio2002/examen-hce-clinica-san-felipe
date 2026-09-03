import { SetMetadata } from '@nestjs/common';

export const CLAVE_PUBLICO = 'ruta_publica';

/**
 * Marca una ruta como accesible sin token.
 *
 * El guard JWT es global: por defecto TODO esta protegido y hay que declarar
 * explicitamente lo publico. Es la eleccion segura, porque olvidar el decorador
 * deja el endpoint cerrado en lugar de abierto.
 */
export const Publico = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_PUBLICO, true);
