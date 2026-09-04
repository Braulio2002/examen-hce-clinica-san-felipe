import type { RolUsuario } from '../../../dominio/entidades/usuario.entidad';

/**
 * CAPA 2 · APLICACION — Puerto de salida para la emisión de tokens.
 *
 * El caso de uso de inicio de sesión necesita emitir un token, pero NO debe
 * conocer @nestjs/jwt ni ConfigService. Si los conociera, la regla de negocio
 * "la sesión dura 30 minutos" quedaría atada al framework y no podría probarse
 * sin levantarlo.
 *
 * La aplicación declara el contrato; el adaptador `JwtNestAdaptador` lo cumple
 * usando @nestjs/jwt y leyendo la vigencia de la configuración.
 */
export interface ContenidoToken {
  readonly idUsuario: number;
  readonly username: string;
  readonly nombreCompleto: string;
  readonly rol: RolUsuario;
}

export interface TokenEmitido {
  readonly token: string;
  readonly expiraEnSegundos: number;
}

export interface ServicioTokenPuerto {
  emitir(contenido: ContenidoToken): Promise<TokenEmitido>;
}

export const SERVICIO_TOKEN = Symbol('SERVICIO_TOKEN');
