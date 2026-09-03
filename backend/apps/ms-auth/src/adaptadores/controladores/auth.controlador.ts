import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { PATRONES_AUTH } from '@hce/compartido';

import { AutenticacionFachada } from '../../aplicacion/fachadas/autenticacion.fachada';
import {
  IniciarSesionPeticion,
  ObtenerPerfilPeticion,
  PerfilUsuarioRespuesta,
  SesionRespuesta,
} from '../../aplicacion/modelos/auth.modelos';

/** Token de inyección de la fachada, resuelto en la capa de infraestructura. */
export const AUTENTICACION_FACHADA = Symbol('AUTENTICACION_FACHADA');

/**
 * CAPA 3 · ADAPTADORES — Controlador de transporte TCP.
 *
 * Su única responsabilidad es traducir mensajes del transporte a llamadas de la
 * fachada. No contiene reglas de negocio ni acceso a datos: si este archivo
 * creciera, sería señal de que la lógica se está filtrando hacia el borde.
 */
@Controller()
export class AuthControlador {
  constructor(
    @Inject(AUTENTICACION_FACHADA) private readonly fachada: AutenticacionFachada,
  ) {}

  @MessagePattern(PATRONES_AUTH.INICIAR_SESION)
  iniciarSesion(@Payload() credenciales: IniciarSesionPeticion): Promise<SesionRespuesta> {
    return this.fachada.autenticar(credenciales);
  }

  @MessagePattern(PATRONES_AUTH.PERFIL)
  perfil(@Payload() peticion: ObtenerPerfilPeticion): Promise<PerfilUsuarioRespuesta> {
    return this.fachada.perfil(peticion);
  }
}
