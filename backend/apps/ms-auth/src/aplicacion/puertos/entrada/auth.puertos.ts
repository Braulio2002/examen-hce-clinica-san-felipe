import { CasoUso } from '@hce/compartido';

import {
  IniciarSesionPeticion,
  ObtenerPerfilPeticion,
  PerfilUsuarioRespuesta,
  SesionRespuesta,
} from '../../modelos/auth.modelos';

/**
 * CAPA 2 · APLICACION — Puertos de entrada (Input Boundaries).
 *
 * Cada caso de uso se expone como una interfaz. El controlador depende de estas
 * fronteras, nunca de las clases concretas, de modo que puede probarse con un
 * doble trivial y no arrastra la implementación al construirse.
 */
export type IniciarSesionPuerto = CasoUso<IniciarSesionPeticion, SesionRespuesta>;
export const INICIAR_SESION_PUERTO = Symbol('INICIAR_SESION_PUERTO');

export type ObtenerPerfilPuerto = CasoUso<ObtenerPerfilPeticion, PerfilUsuarioRespuesta>;
export const OBTENER_PERFIL_PUERTO = Symbol('OBTENER_PERFIL_PUERTO');
