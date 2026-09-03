import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_AUTH } from '@hce/compartido';

import { AutenticacionFachada } from '../../aplicacion/auth.fachada';
import { Credenciales, ResultadoSesion } from '../../aplicacion/casos-uso/iniciar-sesion.caso-uso';
import { PerfilUsuario } from '../../dominio/entidades/usuario.entidad';

/**
 * Adaptador de entrada del microservicio (transporte TCP).
 *
 * Su unica responsabilidad es traducir mensajes a llamadas de la fachada. No
 * contiene reglas de negocio ni acceso a datos: si este archivo creciera,
 * seria senal de que la logica se esta filtrando hacia el borde.
 */
@Controller()
export class AuthControlador {
  constructor(private readonly fachada: AutenticacionFachada) {}

  @MessagePattern(PATRONES_AUTH.INICIAR_SESION)
  iniciarSesion(@Payload() credenciales: Credenciales): Promise<ResultadoSesion> {
    return this.fachada.autenticar(credenciales);
  }

  @MessagePattern(PATRONES_AUTH.PERFIL)
  perfil(@Payload() payload: { username: string }): Promise<PerfilUsuario> {
    return this.fachada.perfil(payload.username);
  }
}
