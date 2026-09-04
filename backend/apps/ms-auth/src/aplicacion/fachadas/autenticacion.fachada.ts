import type {
  IniciarSesionPeticion,
  ObtenerPerfilPeticion,
  PerfilUsuarioRespuesta,
  SesionRespuesta,
} from '../modelos/auth.modelos';
import type {
  IniciarSesionPuerto,
  ObtenerPerfilPuerto,
} from '../puertos/entrada/auth.puertos';

/**
 * CAPA 2 · APLICACION — PATRON FACADE.
 *
 * Punto de entrada único del subsistema de autenticación. El controlador
 * depende solo de esta clase y desconoce cuántos casos de uso existen, cómo se
 * llaman y en qué orden se componen.
 *
 * Nótese que la fachada depende de los PUERTOS de entrada, no de las clases
 * concretas: respeta la misma regla de dependencia que el resto de la capa.
 *
 * La fachada NO contiene reglas de negocio, solo orquesta. Cualquier `if` de
 * negocio que apareciera aquí sería señal de que falta un caso de uso.
 */
export class AutenticacionFachada {
  constructor(
    private readonly iniciarSesion: IniciarSesionPuerto,
    private readonly obtenerPerfil: ObtenerPerfilPuerto,
  ) {}

  autenticar(credenciales: IniciarSesionPeticion): Promise<SesionRespuesta> {
    return this.iniciarSesion.ejecutar(credenciales);
  }

  perfil(peticion: ObtenerPerfilPeticion): Promise<PerfilUsuarioRespuesta> {
    return this.obtenerPerfil.ejecutar(peticion);
  }
}
