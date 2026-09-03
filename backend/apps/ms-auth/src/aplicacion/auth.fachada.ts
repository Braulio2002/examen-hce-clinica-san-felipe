import { Injectable } from '@nestjs/common';

import { PerfilUsuario } from '../dominio/entidades/usuario.entidad';
import {
  Credenciales,
  IniciarSesionCasoUso,
  ResultadoSesion,
} from './casos-uso/iniciar-sesion.caso-uso';
import { ObtenerPerfilCasoUso } from './casos-uso/obtener-perfil.caso-uso';

/**
 * PATRON FACADE
 * =============
 * Punto de entrada unico del subsistema de autenticacion.
 *
 * El controlador de transporte depende solo de esta fachada y desconoce cuantos
 * casos de uso existen, como se llaman y en que orden se componen. Beneficios
 * concretos en este proyecto:
 *
 *   - Agregar un caso de uso (renovar token, cerrar sesion, bloquear cuenta
 *     tras N intentos) no obliga a tocar el controlador.
 *   - El controlador queda reducido a traduccion de transporte, que es
 *     exactamente lo que la arquitectura hexagonal espera de un adaptador.
 *   - Las pruebas del controlador se hacen contra una sola dependencia simulada.
 *
 * La fachada NO contiene reglas de negocio: solo orquesta. Cualquier logica que
 * aparezca aqui es senal de que falta un caso de uso.
 */
@Injectable()
export class AutenticacionFachada {
  constructor(
    private readonly iniciarSesion: IniciarSesionCasoUso,
    private readonly obtenerPerfil: ObtenerPerfilCasoUso,
  ) {}

  autenticar(credenciales: Credenciales): Promise<ResultadoSesion> {
    return this.iniciarSesion.ejecutar(credenciales);
  }

  perfil(username: string): Promise<PerfilUsuario> {
    return this.obtenerPerfil.ejecutar(username);
  }
}
