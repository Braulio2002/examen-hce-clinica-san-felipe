/**
 * CAPA 2 · APLICACION — Puerto de salida para el hashing de contraseñas.
 *
 * Aísla la aplicación de la librería concreta (bcrypt hoy, argon2 mañana) y
 * permite sustituirla en pruebas por una implementación determinista, sin pagar
 * el coste de CPU del hashing real en cada ejecución de la suite.
 */
export interface ServicioHashPuerto {
  verificar(passwordPlano: string, hash: string): Promise<boolean>;
  generar(passwordPlano: string): Promise<string>;
}

export const SERVICIO_HASH = Symbol('SERVICIO_HASH');
