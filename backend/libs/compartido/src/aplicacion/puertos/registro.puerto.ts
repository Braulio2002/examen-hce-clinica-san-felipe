/**
 * CAPA 2 · APLICACION — Puerto de salida para el registro de eventos.
 *
 * Los casos de uso necesitan dejar traza, pero no deben conocer el Logger de
 * NestJS: eso ataría la lógica de negocio al framework y violaría la regla de
 * dependencia de Clean Architecture.
 *
 * La aplicación declara QUE necesita registrar; la capa de adaptadores decide
 * CON QUE. Hoy es el Logger de NestJS; mañana podría ser Pino, un exportador
 * de OpenTelemetry o un doble de prueba que acumula mensajes en memoria.
 *
 * Los verbos están en español para mantener el lenguaje ubicuo del dominio.
 */
export interface RegistroPuerto {
  depurar(mensaje: string): void;
  informar(mensaje: string): void;
  advertir(mensaje: string): void;
  error(mensaje: string, detalle?: string): void;
}

/** Token de inyección. Una interfaz de TypeScript no existe en tiempo de ejecución. */
export const REGISTRO_PUERTO = Symbol('REGISTRO_PUERTO');
